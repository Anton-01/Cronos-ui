import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  FormsModule,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import {
  AsYouType,
  CountryCode,
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
} from 'libphonenumber-js/max';
import examples from 'libphonenumber-js/examples.mobile.json';

import { TranslatePipe } from '@ngx-translate/core';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';

import { LanguageService } from 'src/app/core/services/language.service';
import { phoneNumberValidator } from '../../validators/phone.validators';

export interface PhoneCountryOption {
  code: CountryCode;
  /** Localized with `Intl.DisplayNames`, so no per-country i18n keys are needed. */
  name: string;
  dialCode: string;
  flag: string;
}

/** Regional-indicator emoji for an ISO 3166-1 alpha-2 code (`MX` → 🇲🇽). */
function flagOf(code: CountryCode): string {
  return String.fromCodePoint(...[...code].map((char) => 0x1f1a5 + char.charCodeAt(0)));
}

/** Formats national digits the way the selected country writes them. */
function formatNational(digits: string, country: CountryCode): string {
  return digits ? new AsYouType(country).input(digits) : '';
}

/**
 * International phone input: country selector (flag + dialing code, filterable
 * across every ITU region) and a national-number field masked as you type.
 *
 * Model value is **E.164** (`+525512345678`) or `null` — the only format the
 * API accepts. Validation runs against the full numbering-plan metadata, so it
 * rejects numbers that are the right length but not actually assignable.
 */
@Component({
  selector: 'app-phone-input',
  standalone: true,
  imports: [FormsModule, TranslatePipe, InputTextModule, SelectModule],
  templateUrl: './phone-input.component.html',
  styleUrl: './phone-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PhoneInputComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => PhoneInputComponent), multi: true },
  ],
})
export class PhoneInputComponent implements ControlValueAccessor, Validator {
  private readonly language = inject(LanguageService);

  readonly inputId = input('phoneNumber');
  readonly defaultCountry = input<CountryCode>('MX');
  /** Pinned to the top of the list, in this order. */
  readonly preferredCountries = input<readonly CountryCode[]>(['MX', 'US', 'CA', 'ES']);
  /** Parent-owned invalid state (touched && invalid), forwarded to both PrimeNG controls. */
  readonly invalid = input(false);

  protected readonly country = signal<CountryCode | null>(null);
  protected readonly display = signal('');
  protected readonly disabled = signal(false);

  private readonly validatePhone = phoneNumberValidator();
  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};
  private onValidatorChange: () => void = () => {};

  protected readonly activeCountry = computed<CountryCode>(() => this.country() ?? this.defaultCountry());

  protected readonly countries = computed<PhoneCountryOption[]>(() => {
    const regionNames = new Intl.DisplayNames([this.language.current()], { type: 'region' });
    const collator = new Intl.Collator(this.language.current());
    const preferred = this.preferredCountries();

    const toOption = (code: CountryCode): PhoneCountryOption => ({
      code,
      name: regionNames.of(code) ?? code,
      dialCode: `+${getCountryCallingCode(code)}`,
      flag: flagOf(code),
    });

    const rest = getCountries()
      .filter((code) => !preferred.includes(code))
      .map(toOption)
      .sort((a, b) => collator.compare(a.name, b.name));
    return [...preferred.map(toOption), ...rest];
  });

  protected readonly selectedOption = computed(() =>
    this.countries().find((option) => option.code === this.activeCountry()),
  );

  protected readonly placeholder = computed(
    () => getExampleNumber(this.activeCountry(), examples)?.formatNational() ?? '',
  );

  // ─── ControlValueAccessor ───

  writeValue(value: string | null): void {
    if (!value) {
      this.display.set('');
      return;
    }
    // Legacy rows hold bare national digits; read them as the default country.
    const parsed = parsePhoneNumberFromString(value, this.defaultCountry());
    if (parsed?.country) {
      this.country.set(parsed.country);
      this.display.set(parsed.formatNational());
    } else {
      this.display.set(value);
    }
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  // ─── Validator ───

  validate(control: AbstractControl): ValidationErrors | null {
    return this.validatePhone(control);
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  // ─── Template handlers ───

  protected onCountryChange(code: CountryCode): void {
    this.country.set(code);
    // An unfinished international entry carries its own calling code — drop it.
    const digits = this.display().startsWith('+') ? '' : this.display().replace(/\D/g, '');
    this.display.set(formatNational(digits, code));
    this.onChange(this.toE164(digits, code));
    this.onValidatorChange();
  }

  /**
   * Masks on every keystroke. Typing or pasting a leading `+` switches to
   * international entry: the number is shown as `+1 415…` until the dialing
   * code identifies a country, then the selector jumps to it and the field
   * continues as that country's national format. Digits beyond the country's
   * maximum length are refused; the caret stays after the digit it followed
   * before formatting inserted spaces or parentheses.
   */
  protected onNumberInput(event: Event): void {
    const element = event.target as HTMLInputElement;
    const raw = element.value;
    let country = this.activeCountry();
    let digits = raw.replace(/\D/g, '');

    if (raw.trim().startsWith('+')) {
      const typer = new AsYouType();
      const international = typer.input(`+${digits}`);
      const detected = typer.getCountry();
      if (!detected) {
        // Shared or incomplete calling code (+1, +4…): keep international text.
        this.display.set(international);
        element.value = international;
        this.onChange(digits ? `+${digits}` : null);
        return;
      }
      country = detected;
      this.country.set(detected);
      digits = typer.getNumber()?.nationalNumber ?? '';
    }

    const previousDigits = this.display().replace(/\D/g, '');
    if (digits && validatePhoneNumberLength(digits, country) === 'TOO_LONG') {
      digits = previousDigits;
    }

    const digitsBeforeCaret = raw.slice(0, element.selectionStart ?? raw.length).replace(/\D/g, '').length;
    const formatted = formatNational(digits, country);
    this.display.set(formatted);
    // The signal may hold the same string (rejected keystroke), so write the
    // DOM directly; otherwise the refused character would stay visible.
    element.value = formatted;
    this.restoreCaret(element, formatted, Math.min(digitsBeforeCaret, digits.length));

    this.onChange(this.toE164(digits, country));
  }

  protected markTouched(): void {
    this.onTouched();
  }

  private restoreCaret(element: HTMLInputElement, formatted: string, digitCount: number): void {
    let position = 0;
    let seen = 0;
    while (position < formatted.length && seen < digitCount) {
      if (/\d/.test(formatted[position])) {
        seen++;
      }
      position++;
    }
    element.setSelectionRange(position, position);
  }

  private toE164(digits: string, country: CountryCode): string | null {
    if (!digits) {
      return null;
    }
    // `parse…().number` drops national trunk prefixes (UK "07…" → +447…);
    // an incomplete number that cannot parse yet still gets a best-effort
    // E.164 so the validator can report TOO_SHORT rather than nothing.
    return parsePhoneNumberFromString(digits, country)?.number ?? `+${getCountryCallingCode(country)}${digits}`;
  }
}
