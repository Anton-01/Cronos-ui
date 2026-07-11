import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormArray,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { QuoteService } from 'src/app/core/services/domain/quote.service';
import {
  CreateQuoteRequest,
  QuoteItemRequest,
  RecipeSimpleResponse,
} from 'src/app/core/models/domain.model';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ToastService } from 'src/app/shared/services/toast.service';

export interface PhoneCountry {
  code: 'MX' | 'US';
  name: string;
  dialCode: string;
  flag: string;
  mask: string; // pattern with '#' as digit placeholder
  maxDigits: number;
  placeholder: string;
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
  {
    code: 'MX',
    name: 'México',
    dialCode: '+52',
    flag: '🇲🇽',
    mask: '## #### ####',
    maxDigits: 10,
    placeholder: '55 1234 5678',
  },
  {
    code: 'US',
    name: 'Estados Unidos',
    dialCode: '+1',
    flag: '🇺🇸',
    mask: '(###) ###-####',
    maxDigits: 10,
    placeholder: '(555) 123-4567',
  },
];

@Component({
  selector: 'app-quote-form',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    AutoCompleteModule,
    ButtonModule,
    CardModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TextareaModule,
    TooltipModule,
  ],
  templateUrl: './quote-form.component.html',
  styleUrl: './quote-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteFormComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly quoteService = inject(QuoteService);
  private readonly alertService = inject(AlertService);
  private readonly toastService = inject(ToastService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  readonly isSaving = signal(false);
  readonly recipeSuggestions = signal<RecipeSimpleResponse[]>([]);

  readonly phoneCountries = PHONE_COUNTRIES;
  readonly selectedCountry = signal<PhoneCountry>(PHONE_COUNTRIES[0]);

  readonly form = this.fb.group({
    clientName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
    clientEmail: ['', [Validators.email, Validators.maxLength(255)]],
    clientPhone: ['', [Validators.maxLength(25)]],
    clientAddress: ['', [Validators.maxLength(500)]],
    notes: ['', [Validators.maxLength(1000)]],
    taxRate: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    currency: ['MXN', [Validators.required]],
    validDays: [15, [Validators.required, Validators.min(1), Validators.max(365)]],
    deliveryFee: [0, [Validators.required, Validators.min(0)]],
    extraFee: [0, [Validators.required, Validators.min(0)]],
    extraFeeDescription: ['', [Validators.maxLength(255)]],
    items: this.fb.array([], [Validators.minLength(1)]),
  });

  // ─── Computed totals ───
  readonly subtotal = signal(0);
  readonly taxAmount = signal(0);
  readonly deliveryFeeValue = signal(0);
  readonly extraFeeValue = signal(0);
  readonly total = signal(0);

  readonly currencies = ['MXN', 'USD', 'EUR', 'COP', 'ARS', 'CLP', 'PEN', 'GTQ'];

  get items(): FormArray {
    return this.form.get('items') as FormArray;
  }

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Nueva Cotización');
    this.pageInfoService.updateDescription('Captura los datos del cliente y los productos a cotizar');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: 'Cotizaciones', path: '/cronos/cotizaciones', isActive: false },
      { title: 'Nueva', path: '', isActive: true },
    ]);

    this.addItem();

    this.items.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.recalcTotals());
    for (const field of ['taxRate', 'deliveryFee', 'extraFee']) {
      this.form.get(field)!.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.recalcTotals());
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Item CRUD ───

  createItemGroup(): FormGroup {
    return this.fb.group({
      recipeId: [''],
      recipeSearch: [null as RecipeSimpleResponse | string | null],
      productName: ['', [Validators.required, Validators.maxLength(200)]],
      productDescription: [''],
      productSize: [''],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unitCost: [0, [Validators.required, Validators.min(0)]],
      profitPercentage: [50, [Validators.required, Validators.min(0), Validators.max(1000)]],
      unitPrice: [0, [Validators.required, Validators.min(0)]],
      notes: [''],
    });
  }

  addItem(): void {
    this.items.push(this.createItemGroup());
  }

  removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(index);
    }
  }

  getItemGroup(index: number): FormGroup {
    return this.items.at(index) as FormGroup;
  }

  // ─── Price calculations ───

  onCostOrProfitChange(index: number): void {
    const group = this.getItemGroup(index);
    const cost = group.get('unitCost')!.value || 0;
    const profit = group.get('profitPercentage')!.value || 0;
    const unitPrice = +(cost * (1 + profit / 100)).toFixed(2);
    group.get('unitPrice')!.setValue(unitPrice, { emitEvent: true });
  }

  onUnitPriceChange(index: number): void {
    const group = this.getItemGroup(index);
    const cost = group.get('unitCost')!.value || 0;
    const price = group.get('unitPrice')!.value || 0;
    if (cost > 0) {
      const profit = +(((price - cost) / cost) * 100).toFixed(2);
      group.get('profitPercentage')!.setValue(profit, { emitEvent: false });
    }
  }

  getItemSubtotal(index: number): number {
    const group = this.getItemGroup(index);
    const quantity = group.get('quantity')!.value || 0;
    const price = group.get('unitPrice')!.value || 0;
    return +(quantity * price).toFixed(2);
  }

  recalcTotals(): void {
    let subtotal = 0;
    for (let i = 0; i < this.items.length; i++) {
      subtotal += this.getItemSubtotal(i);
    }
    subtotal = +subtotal.toFixed(2);
    const rate = this.form.get('taxRate')!.value || 0;
    const delivery = +(this.form.get('deliveryFee')!.value || 0);
    const extra = +(this.form.get('extraFee')!.value || 0);
    const tax = +((subtotal * rate) / 100).toFixed(2);
    this.subtotal.set(subtotal);
    this.taxAmount.set(tax);
    this.deliveryFeeValue.set(+delivery.toFixed(2));
    this.extraFeeValue.set(+extra.toFixed(2));
    this.total.set(+(subtotal + tax + delivery + extra).toFixed(2));
  }

  // ─── Recipe autocomplete ───

  searchRecipes(event: AutoCompleteCompleteEvent): void {
    const term = event.query?.trim() ?? '';
    if (term.length < 2) {
      this.recipeSuggestions.set([]);
      return;
    }
    this.quoteService.searchRecipes(term).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => this.recipeSuggestions.set(res.data || []),
    });
  }

  onRecipeSelected(recipe: RecipeSimpleResponse, rowIndex: number): void {
    const group = this.getItemGroup(rowIndex);
    const cost = recipe.totalCost ?? recipe.costPerUnit ?? 0;
    group.patchValue({
      recipeId: recipe.id,
      productName: recipe.name,
      productDescription: recipe.description || '',
      unitCost: cost,
    });
    this.onCostOrProfitChange(rowIndex);
  }

  // ─── Phone helpers ───

  onCountryChange(country: PhoneCountry): void {
    this.selectedCountry.set(country);
    const current = this.form.get('clientPhone')!.value || '';
    const digits = current.replace(/\D/g, '').slice(0, country.maxDigits);
    this.form.get('clientPhone')!.setValue(this.applyMask(digits, country.mask));
  }

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const country = this.selectedCountry();
    const digits = input.value.replace(/\D/g, '').slice(0, country.maxDigits);
    const formatted = this.applyMask(digits, country.mask);
    this.form.get('clientPhone')!.setValue(formatted, { emitEvent: false });
    queueMicrotask(() => input.setSelectionRange(formatted.length, formatted.length));
  }

  private applyMask(digits: string, mask: string): string {
    let result = '';
    let digitIndex = 0;
    for (const char of mask) {
      if (digitIndex >= digits.length) {
        break;
      }
      result += char === '#' ? digits[digitIndex++] : char;
    }
    return result;
  }

  private buildFullPhone(): string | undefined {
    const local = (this.form.get('clientPhone')!.value || '').trim();
    if (!local) {
      return undefined;
    }
    return `${this.selectedCountry().dialCode} ${local}`;
  }

  // ─── Submit ───

  save(): void {
    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      this.items.controls.forEach((control) => (control as FormGroup).markAllAsTouched());
      this.alertService.warning('Revisa los campos marcados antes de guardar.');
      return;
    }

    this.isSaving.set(true);

    const formValue = this.form.value;
    const payload: CreateQuoteRequest = {
      clientName: formValue.clientName!,
      clientEmail: formValue.clientEmail || undefined,
      clientPhone: this.buildFullPhone(),
      clientAddress: formValue.clientAddress || undefined,
      notes: formValue.notes || undefined,
      taxRate: formValue.taxRate!,
      currency: formValue.currency!,
      validDays: formValue.validDays!,
      deliveryFee: formValue.deliveryFee ?? 0,
      extraFee: formValue.extraFee ?? 0,
      extraFeeDescription: formValue.extraFeeDescription || undefined,
      items: (formValue.items as any[]).map(
        (item) =>
          ({
            recipeId: item.recipeId || undefined,
            productName: item.productName,
            productDescription: item.productDescription || undefined,
            productSize: item.productSize || undefined,
            quantity: item.quantity,
            unitCost: item.unitCost,
            profitPercentage: item.profitPercentage,
            unitPrice: item.unitPrice,
            notes: item.notes || undefined,
          }) as QuoteItemRequest
      ),
    };

    this.quoteService.create(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toastService.success('Cotización creada', 'Se ha generado la cotización exitosamente.');
        this.router.navigate(['/cronos/cotizaciones']);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.alertService.error(err?.error?.message || 'Error al crear la cotización');
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/cronos/cotizaciones']);
  }

  // ─── Helpers ───

  isFieldInvalid(field: string): boolean {
    const control = this.form.get(field);
    return !!control && control.invalid && control.touched;
  }

  isItemFieldInvalid(index: number, field: string): boolean {
    const control = this.getItemGroup(index).get(field);
    return !!control && control.invalid && control.touched;
  }
}
