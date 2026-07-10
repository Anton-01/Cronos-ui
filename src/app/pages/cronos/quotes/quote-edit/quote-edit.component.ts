import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormArray,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { QuoteService } from 'src/app/core/services/domain/quote.service';
import {
  CreateQuoteRequest,
  QuoteDetailResponse,
  QuoteItemDetailResponse,
  QuoteItemRequest,
} from 'src/app/core/models/domain.model';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';

// Terminal statuses lock editing for audit purposes
const LOCKED_STATUSES = ['ACCEPTED', 'REJECTED'] as const;

type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary';

@Component({
  selector: 'app-quote-edit',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TagModule,
    TextareaModule,
    TooltipModule,
  ],
  templateUrl: './quote-edit.component.html',
  styleUrl: '../quote-form/quote-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteEditComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly quoteService = inject(QuoteService);
  private readonly alertService = inject(AlertService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy$ = new Subject<void>();

  // ─── UI state ───
  readonly quoteId = signal<string | null>(null);
  readonly quoteNumber = signal<string>('');
  readonly status = signal<string>('');
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isReadOnly = signal(false);
  readonly loadError = signal<string | null>(null);

  // ─── Reactive totals ───
  readonly subtotal = signal(0);
  readonly taxAmount = signal(0);
  readonly deliveryFeeValue = signal(0);
  readonly extraFeeValue = signal(0);
  readonly total = signal(0);

  readonly currencies = ['MXN', 'USD', 'EUR', 'COP', 'ARS', 'CLP', 'PEN', 'GTQ'];

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

  get items(): FormArray {
    return this.form.get('items') as FormArray;
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError.set('No se recibió un identificador de cotización.');
      this.isLoading.set(false);
      return;
    }
    this.quoteId.set(id);

    this.pageInfoService.updateTitle('Editar Cotización');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: 'Cotizaciones', path: '/cronos/cotizaciones', isActive: false },
      { title: 'Editar', path: '', isActive: true },
    ]);

    // Any form change recalculates totals
    this.form.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.recalcTotals());

    this.loadQuote(id);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Form initialization ───

  private loadQuote(id: string): void {
    this.isLoading.set(true);
    this.quoteService.getById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.hydrateForm(res.data);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.loadError.set(err?.error?.message || 'No se pudo cargar la cotización. Inténtalo de nuevo.');
        },
      });
  }

  private hydrateForm(data: QuoteDetailResponse): void {
    this.quoteNumber.set(data.quoteNumber);
    this.status.set(data.status);

    this.items.clear();
    (data.items ?? []).forEach((item) => this.items.push(this.createItemGroup(item)));

    this.form.patchValue({
      clientName: data.clientName ?? '',
      clientEmail: data.clientEmail ?? '',
      clientPhone: data.clientPhone ?? '',
      clientAddress: data.clientAddress ?? '',
      notes: data.notes ?? '',
      taxRate: data.taxRate ?? 0,
      currency: data.currency ?? 'MXN',
      validDays: data.validDays ?? 15,
      deliveryFee: data.deliveryFee ?? 0,
      extraFee: data.extraFee ?? 0,
      extraFeeDescription: data.extraFeeDescription ?? '',
    });

    this.recalcTotals();

    // Business rule: terminal statuses are read-only
    if (this.isStatusLocked(data.status)) {
      this.isReadOnly.set(true);
      this.form.disable({ emitEvent: false });
    }
  }

  private createItemGroup(item?: QuoteItemDetailResponse): FormGroup {
    return this.fb.group({
      recipeId: [item?.recipeId ?? ''],
      productName: [item?.productName ?? '', [Validators.required, Validators.maxLength(200)]],
      productDescription: [item?.productDescription ?? ''],
      productSize: [item?.productSize ?? ''],
      quantity: [item?.quantity ?? 1, [Validators.required, Validators.min(1)]],
      unitCost: [item?.unitCost ?? 0, [Validators.required, Validators.min(0)]],
      profitPercentage: [item?.profitPercentage ?? 0, [Validators.required, Validators.min(0), Validators.max(1000)]],
      unitPrice: [item?.unitPrice ?? 0, [Validators.required, Validators.min(0)]],
      notes: [item?.notes ?? ''],
    });
  }

  private isStatusLocked(status: string | null | undefined): boolean {
    if (!status) {
      return false;
    }
    return LOCKED_STATUSES.includes(status.toUpperCase() as (typeof LOCKED_STATUSES)[number]);
  }

  // ─── Item management ───

  getItemGroup(index: number): FormGroup {
    return this.items.at(index) as FormGroup;
  }

  addItem(): void {
    if (this.isReadOnly()) {
      return;
    }
    this.items.push(this.createItemGroup());
  }

  removeItem(index: number): void {
    if (this.isReadOnly()) {
      return;
    }
    if (this.items.length > 1) {
      this.items.removeAt(index);
    }
  }

  onCostOrProfitChange(index: number): void {
    const group = this.getItemGroup(index);
    const cost = +(group.get('unitCost')!.value || 0);
    const profit = +(group.get('profitPercentage')!.value || 0);
    const unitPrice = +(cost * (1 + profit / 100)).toFixed(2);
    group.get('unitPrice')!.setValue(unitPrice);
  }

  onUnitPriceChange(index: number): void {
    const group = this.getItemGroup(index);
    const cost = +(group.get('unitCost')!.value || 0);
    const price = +(group.get('unitPrice')!.value || 0);
    if (cost > 0) {
      const profit = +(((price - cost) / cost) * 100).toFixed(2);
      group.get('profitPercentage')!.setValue(profit, { emitEvent: false });
    }
  }

  getItemSubtotal(index: number): number {
    const group = this.getItemGroup(index);
    const quantity = +(group.get('quantity')!.value || 0);
    const price = +(group.get('unitPrice')!.value || 0);
    return +(quantity * price).toFixed(2);
  }

  // ─── Totals: Subtotal + Tax + Delivery + Extra = TOTAL ───

  private recalcTotals(): void {
    let subtotal = 0;
    for (let i = 0; i < this.items.length; i++) {
      subtotal += this.getItemSubtotal(i);
    }
    subtotal = +subtotal.toFixed(2);

    const rate = +(this.form.get('taxRate')!.value || 0);
    const delivery = +(this.form.get('deliveryFee')!.value || 0);
    const extra = +(this.form.get('extraFee')!.value || 0);
    const tax = +((subtotal * rate) / 100).toFixed(2);

    this.subtotal.set(subtotal);
    this.taxAmount.set(tax);
    this.deliveryFeeValue.set(+delivery.toFixed(2));
    this.extraFeeValue.set(+extra.toFixed(2));
    this.total.set(+(subtotal + tax + delivery + extra).toFixed(2));
  }

  // ─── Save ───

  save(): void {
    if (this.isReadOnly()) {
      return;
    }

    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      this.items.controls.forEach((control) => (control as FormGroup).markAllAsTouched());
      this.alertService.warning('Revisa los campos marcados antes de guardar.');
      return;
    }

    const id = this.quoteId();
    if (!id) {
      return;
    }

    this.isSaving.set(true);
    const payload = this.buildPayload();

    this.quoteService.update(id, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.alertService.success(`La cotización ${this.quoteNumber()} fue actualizada exitosamente.`, '¡Cotización actualizada!');
          this.router.navigate(['/cronos/cotizaciones']);
        },
        error: (err) => {
          this.isSaving.set(false);
          this.alertService.error(err?.error?.message || 'No se pudo actualizar la cotización.', 'Error al guardar');
        },
      });
  }

  private buildPayload(): CreateQuoteRequest {
    const value = this.form.getRawValue();
    return {
      clientName: value.clientName!,
      clientEmail: value.clientEmail || undefined,
      clientPhone: value.clientPhone || undefined,
      clientAddress: value.clientAddress || undefined,
      notes: value.notes || undefined,
      taxRate: value.taxRate!,
      currency: value.currency!,
      validDays: value.validDays!,
      deliveryFee: value.deliveryFee ?? 0,
      extraFee: value.extraFee ?? 0,
      extraFeeDescription: value.extraFeeDescription || undefined,
      items: (value.items as QuoteItemDetailResponse[]).map(
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
  }

  cancel(): void {
    this.router.navigate(['/cronos/cotizaciones']);
  }

  // ─── Validation helpers ───

  isFieldInvalid(field: string): boolean {
    const control = this.form.get(field);
    return !!control && control.invalid && control.touched;
  }

  isItemFieldInvalid(index: number, field: string): boolean {
    const control = this.getItemGroup(index).get(field);
    return !!control && control.invalid && control.touched;
  }

  statusLabel(): string {
    const status = (this.status() || '').toUpperCase();
    switch (status) {
      case 'DRAFT':
        return 'Borrador';
      case 'SENT':
        return 'Enviada';
      case 'ACCEPTED':
        return 'Aceptada';
      case 'REJECTED':
        return 'Rechazada';
      case 'EXPIRED':
        return 'Expirada';
      default:
        return status || '—';
    }
  }

  statusSeverity(): TagSeverity {
    const status = (this.status() || '').toUpperCase();
    switch (status) {
      case 'SENT':
        return 'info';
      case 'ACCEPTED':
        return 'success';
      case 'REJECTED':
        return 'danger';
      case 'EXPIRED':
        return 'warn';
      default:
        return 'secondary';
    }
  }
}
