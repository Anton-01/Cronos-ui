import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';

import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';

import { CategoryService } from 'src/app/core/services/domain/category.service';
import {
  CategoryResponse,
  CategoryType,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from 'src/app/core/models/category.model';
import { ApiErrorDetail } from 'src/app/core/models';
import { apiErrorMessage, apiErrors } from 'src/app/core/utils/api-error.util';
import { LanguageService } from 'src/app/core/services/language.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { SelectOption, categoryTypeLabelKey, categoryTypeOptions } from '../category-presentation';

export const CATEGORY_NAME_MAX_LENGTH = 60;
export const CATEGORY_DESCRIPTION_MAX_LENGTH = 255;

/**
 * A clean category name: starts with a letter or digit, then letters, digits,
 * single inner spaces and a short set of punctuation. Unicode-aware so
 * "Panadería" and "Repostería fina" pass while "  ", "--" or "<b>" do not.
 */
const CATEGORY_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .,&'()/-]*$/u;

/**
 * The dialog's form, exactly as `getRawValue()` returns it.
 *
 * `type` is present here even though its control is permanently disabled —
 * that is the whole point of reading the form through `getRawValue()` rather
 * than `value`, which would silently drop it and post a category with no type.
 */
export interface CategoryFormValue {
  name: string;
  description: string;
  type: CategoryType;
}

/** The three controls that can carry a server-side error. */
type CategoryControlName = 'name' | 'description' | 'type';

/** Rejects values whose stored form would differ from what the user typed. */
function cleanNameValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: unknown = control.value;
    if (typeof value !== 'string' || value.length === 0) {
      return null;
    }
    if (value !== value.trim()) {
      return { surroundingWhitespace: true };
    }
    if (/\s{2,}/.test(value)) {
      return { repeatedWhitespace: true };
    }
    return CATEGORY_NAME_PATTERN.test(value) ? null : { cleanName: true };
  };
}

/** Which form control an `errors[].field` maps onto. */
const SERVER_FIELD_TO_CONTROL: Readonly<Record<string, CategoryControlName>> = {
  name: 'name',
  description: 'description',
  type: 'type',
};

/**
 * Create / edit / view dialog for a single category.
 *
 * `type` is never editable. On create it is pre-filled from the route the list
 * is showing (Ingredient Categories ⇒ `INGREDIENT`) and rendered as a
 * *disabled* `p-select`, so the field still reads as the classification it is
 * without offering a choice that would file the row under the wrong catalog.
 * On edit it collapses to a plain read-only select for the same reason the
 * backend gives: `type` is fixed at creation and every later change is
 * rejected. In `readOnly` mode (a SYSTEM row) every control is disabled and
 * the footer collapses to a single "Close".
 */
@Component({
  selector: 'app-category-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TextareaModule,
  ],
  templateUrl: './category-form-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryFormDialogComponent implements OnInit {
  private readonly categoryService = inject(CategoryService);
  private readonly alertService = inject(AlertService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  /** Type the list is scoped to — the classification a new category inherits. */
  readonly type = input.required<CategoryType>();

  /** Row being edited or inspected; `null` opens the dialog in create mode. */
  readonly category = input<CategoryResponse | null>(null);

  /** Inspect-only: SYSTEM rows are immutable for every caller. */
  readonly readOnly = input(false);

  /** Emitted with the persisted row after a successful create or update. */
  readonly saved = output<CategoryResponse>();

  /** Emitted when the dialog should be torn down. */
  readonly closed = output<void>();

  /**
   * Emitted when the server rejected the write because the row is not the
   * caller's to change — the list state is stale and should be refetched.
   */
  readonly desynced = output<void>();

  readonly isSaving = signal(false);

  readonly maxNameLength = CATEGORY_NAME_MAX_LENGTH;
  readonly maxDescriptionLength = CATEGORY_DESCRIPTION_MAX_LENGTH;

  readonly form = this.fb.nonNullable.group({
    name: [
      '',
      [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(CATEGORY_NAME_MAX_LENGTH),
        cleanNameValidator(),
      ],
    ],
    description: ['', [Validators.maxLength(CATEGORY_DESCRIPTION_MAX_LENGTH)]],
    // Disabled for the lifetime of the dialog — see `lockType()`. It keeps its
    // `required` validator so a future enabling cannot quietly post a blank.
    type: this.fb.nonNullable.control<CategoryType>('PRODUCT', [Validators.required]),
  });

  readonly isEditMode = computed(() => this.category() !== null);

  /** Both selects render the same catalog; only the create one is reachable. */
  readonly typeOptions = computed<SelectOption<CategoryType>[]>(() =>
    categoryTypeOptions((key) => this.language.t(key)),
  );

  readonly header = computed(() => {
    if (this.readOnly()) {
      return this.language.t('CATEGORIES.MODAL.TITLE_VIEW');
    }
    return this.language.t(this.isEditMode() ? 'CATEGORIES.MODAL.TITLE_EDIT' : 'CATEGORIES.MODAL.TITLE');
  });

  /** The locked type, as display text. */
  readonly lockedTypeLabel = computed(() =>
    this.language.t(categoryTypeLabelKey(this.category()?.type ?? this.type())),
  );

  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  readonly canSubmit = computed(() => this.formStatus() === 'VALID' && !this.isSaving() && !this.readOnly());

  constructor() {
    this.lockType();

    // A server-side rejection is pinned to the control it came from; typing
    // again is the signal that the user is addressing it, so drop it and let
    // the synchronous validators speak for the field once more.
    for (const control of [this.form.controls.name, this.form.controls.description]) {
      control.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
        if (control.hasError('server') || control.hasError('duplicate')) {
          control.updateValueAndValidity({ emitEvent: false });
        }
      });
    }

    effect(() => {
      if (this.readOnly()) {
        this.form.disable({ emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    const current = this.category();
    // Creating ⇒ inherit the list's type; editing ⇒ keep the row's own. Either
    // way the control is disabled, so this is the only thing that ever sets it
    // and `getRawValue()` is the only thing that reads it back.
    this.form.reset({
      name: current?.name ?? '',
      description: current?.description ?? '',
      type: current?.type ?? this.type(),
    });
  }

  /**
   * The data-integrity rule of this dialog: a category's type is decided by
   * where the user is standing, never by what they pick.
   *
   * Disabling the control — rather than only hiding the select or trusting the
   * template — is what makes that true for every path into the form, including
   * a `patchValue` from a future caller. `reset()` preserves the disabled flag,
   * so this runs once and holds for the dialog's lifetime.
   */
  private lockType(): void {
    this.form.controls.type.disable({ emitEvent: false });
  }

  close(): void {
    this.closed.emit();
  }

  /**
   * Validate, persist, notify, and hand the saved row back to the list.
   *
   * Reached from the footer button's click and from a native submit (Enter
   * inside the form). The footer button cannot be a `type="submit"` for this
   * form: PrimeNG renders `p-button` as a `<button>` nested in its own host
   * element and forwards only `type`/`aria-label` to it, and the dialog footer
   * template is rendered *outside* the `<form>` — so neither `form="..."` nor a
   * submit type reaches anything. Calling the method directly is the wiring
   * that actually fires the request.
   */
  saveCategory(): void {
    if (this.readOnly() || this.isSaving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // `getRawValue()`, never `value`: `type` is disabled, and `value` omits
    // disabled controls — reading it here would post a category with no type.
    const { name, description, type }: CategoryFormValue = this.form.getRawValue();
    const trimmedDescription = description.trim();
    const current = this.category();

    this.isSaving.set(true);

    if (current) {
      // `type` is deliberately absent: the backend fixes it at creation and
      // `UpdateCategoryRequest` has no field for it.
      const payload: UpdateCategoryRequest = {
        name: name.trim(),
        description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
      };
      this.categoryService.update(current.id, payload).subscribe({
        next: (res) => this.onWriteSuccess(res.data, 'CATEGORIES.TOAST.UPDATED'),
        error: (err: unknown) => this.onWriteError(err, 'CATEGORIES.TOAST.UPDATE_FAILED'),
      });
      return;
    }

    const payload: CreateCategoryRequest = {
      name: name.trim(),
      description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
      type,
    };
    this.categoryService.create(payload).subscribe({
      next: (res) => this.onWriteSuccess(res.data, 'CATEGORIES.TOAST.CREATED'),
      error: (err: unknown) => this.onWriteError(err, 'CATEGORIES.TOAST.CREATE_FAILED'),
    });
  }

  private onWriteSuccess(category: CategoryResponse, messageKey: string): void {
    this.isSaving.set(false);
    this.alertService.success(this.language.t(messageKey));
    // The parent closes the dialog and splices this row into the grid.
    this.saved.emit(category);
  }

  /**
   * Field-scoped failures land on the control that caused them; ownership
   * failures mean the list is stale, so the dialog closes and asks the parent
   * to refetch rather than leaving the user staring at a form they cannot save.
   */
  private onWriteError(error: unknown, fallbackKey: string): void {
    this.isSaving.set(false);
    const details = apiErrors(error);

    for (const detail of details) {
      switch (detail.code) {
        case 'VALIDATION_FIELD_ERROR':
          this.applyFieldError(detail, this.language.t('CATEGORIES.MODAL.ERRORS.INVALID_VALUE'));
          break;
        case 'DUPLICATE_RESOURCE':
          this.form.controls.name.setErrors({
            duplicate: detail.message ?? this.language.t('CATEGORIES.TOAST.DUPLICATE_NAME'),
          });
          this.form.controls.name.markAsTouched();
          break;
        case 'SYSTEM_RESOURCE_CONFLICT':
          this.alertService.error(
            detail.message ?? this.language.t('CATEGORIES.TOAST.PROTECTED_EDIT'),
            this.language.t('CATEGORIES.TOAST.PROTECTED_TITLE'),
          );
          this.desynced.emit();
          this.close();
          return;
        case 'UNAUTHORIZED_MODIFICATION':
          this.alertService.error(
            detail.message ?? this.language.t('CATEGORIES.TOAST.NOT_OWNER'),
            this.language.t('CATEGORIES.TOAST.NOT_ALLOWED_TITLE'),
          );
          this.desynced.emit();
          this.close();
          return;
      }
    }

    const handledEveryDetail =
      details.length > 0 &&
      details.every(
        (detail) => detail.code === 'VALIDATION_FIELD_ERROR' || detail.code === 'DUPLICATE_RESOURCE',
      );
    if (!handledEveryDetail) {
      this.alertService.error(apiErrorMessage(error, this.language.t(fallbackKey)));
    }
  }

  private applyFieldError(detail: ApiErrorDetail, fallback: string): void {
    const controlName = detail.field ? SERVER_FIELD_TO_CONTROL[detail.field] : undefined;
    if (!controlName) {
      this.alertService.error(detail.message ?? fallback);
      return;
    }
    const control = this.form.controls[controlName];
    control.setErrors({ server: detail.message ?? fallback });
    control.markAsTouched();
  }

  /** The server-supplied text pinned to a control, if any. */
  serverError(controlName: CategoryControlName): string | null {
    const errors = this.form.controls[controlName].errors;
    const message: unknown = errors?.['server'] ?? errors?.['duplicate'];
    return typeof message === 'string' ? message : null;
  }

  isInvalid(controlName: CategoryControlName): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }
}
