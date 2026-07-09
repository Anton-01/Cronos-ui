import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormArray,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { QuoteService } from 'src/app/core/services/domain/quote.service';
import {
  CreateQuoteRequest,
  QuoteDetailResponse,
  QuoteItemDetailResponse,
  QuoteItemRequest,
} from 'src/app/core/models/domain.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import Swal from 'sweetalert2';

// Estados que bloquean la edición por motivos de auditoría
const LOCKED_STATUSES = ['ACCEPTED', 'REJECTED'] as const;

@Component({
    selector: 'app-cotizacion-edit',
    imports: [CommonModule, ReactiveFormsModule, AlertContainerComponent],
    templateUrl: './cotizacion-edit.component.html'
})
export class CotizacionEditComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private service = inject(QuoteService);
  private alertService = inject(AlertService);
  private pageInfoService = inject(PageInfoService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  // ─── UI state ───
  quoteId = signal<string | null>(null);
  quoteNumber = signal<string>('');
  status = signal<string>('');
  isLoading = signal(true);
  isSaving = signal(false);
  isReadOnly = signal(false);
  loadError = signal<string | null>(null);

  // ─── Totales reactivos ───
  subtotal = signal(0);
  taxAmount = signal(0);
  deliveryFeeValue = signal(0);
  extraFeeValue = signal(0);
  total = signal(0);

  currencies = ['MXN', 'USD', 'EUR', 'COP', 'ARS', 'CLP', 'PEN', 'GTQ'];

  // ─── Form principal ───
  form = this.fb.group({
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

  // ─────────────────────────────────────────────────────────
  //  LIFECYCLE
  // ─────────────────────────────────────────────────────────
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
      { title: '', path: '', isActive: false, isSeparator: true },
      { title: 'Cotizaciones', path: '/cronos/cotizaciones', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
      { title: 'Editar', path: '', isActive: true },
    ]);

    // Totales reactivos: cualquier cambio en el formulario recalcula el total.
    this.form.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.recalcTotals());

    this.loadQuote(id);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─────────────────────────────────────────────────────────
  //  INICIALIZACIÓN DEL FORMULARIO
  // ─────────────────────────────────────────────────────────
  private loadQuote(id: string): void {
    this.isLoading.set(true);
    this.service.getById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          const data = res.data;
          this.hydrateForm(data);
          this.isLoading.set(false);
        },
        error: err => {
          this.isLoading.set(false);
          this.loadError.set(
            err?.error?.message || 'No se pudo cargar la cotización. Inténtalo de nuevo.'
          );
        },
      });
  }

  /**
   * Rehidrata el formulario:
   *   1) Itera los items del backend y hace push() de un FormGroup por cada uno.
   *   2) Llama patchValue() en el FormGroup raíz — Angular mapea recursivamente
   *      los valores hacia el FormArray usando los índices que acabamos de crear.
   *   3) Bloquea el formulario si el estado es de sólo lectura.
   */
  private hydrateForm(data: QuoteDetailResponse): void {
    this.quoteNumber.set(data.quoteNumber);
    this.status.set(data.status);

    // 1) Construir un FormGroup vacío por cada item del backend
    this.items.clear();
    (data.items ?? []).forEach(item => {
      this.items.push(this.createItemGroup(item));
    });

    // 2) patchValue en el form principal — rellena cliente, impuestos y logística.
    //    Angular mapea por índice dentro del FormArray 'items'.
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

    // 3) Recalcular totales con los datos cargados
    this.recalcTotals();

    // 4) Regla de negocio: bloquear si el estado es terminal
    if (this.isStatusLocked(data.status)) {
      this.isReadOnly.set(true);
      this.form.disable({ emitEvent: false });
    }
  }

  /**
   * Crea un FormGroup para un item. Si se pasa un item existente, lo pre-llena;
   * así evitamos depender únicamente de patchValue por índice.
   */
  private createItemGroup(item?: QuoteItemDetailResponse): FormGroup {
    return this.fb.group({
      recipeId: [item?.recipeId ?? ''],
      productName: [
        item?.productName ?? '',
        [Validators.required, Validators.maxLength(200)],
      ],
      productDescription: [item?.productDescription ?? ''],
      productSize: [item?.productSize ?? ''],
      quantity: [item?.quantity ?? 1, [Validators.required, Validators.min(1)]],
      unitCost: [item?.unitCost ?? 0, [Validators.required, Validators.min(0)]],
      profitPercentage: [
        item?.profitPercentage ?? 0,
        [Validators.required, Validators.min(0), Validators.max(1000)],
      ],
      unitPrice: [item?.unitPrice ?? 0, [Validators.required, Validators.min(0)]],
      notes: [item?.notes ?? ''],
    });
  }

  private isStatusLocked(status: string | null | undefined): boolean {
    if (!status) return false;
    return LOCKED_STATUSES.includes(status.toUpperCase() as typeof LOCKED_STATUSES[number]);
  }

  // ─────────────────────────────────────────────────────────
  //  GESTIÓN DE ITEMS
  // ─────────────────────────────────────────────────────────
  getItemGroup(index: number): FormGroup {
    return this.items.at(index) as FormGroup;
  }

  addItem(): void {
    if (this.isReadOnly()) return;
    this.items.push(this.createItemGroup());
  }

  removeItem(index: number): void {
    if (this.isReadOnly()) return;
    if (this.items.length > 1) {
      this.items.removeAt(index);
    }
  }

  // Recalcula el precio unitario cuando cambia el costo o el % de ganancia.
  onCostOrProfitChange(index: number): void {
    const group = this.getItemGroup(index);
    const cost = +(group.get('unitCost')!.value || 0);
    const profit = +(group.get('profitPercentage')!.value || 0);
    const unitPrice = +(cost * (1 + profit / 100)).toFixed(2);
    group.get('unitPrice')!.setValue(unitPrice);
  }

  // Inverso: si el usuario escribe un precio unitario, recalculamos el % de ganancia.
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
    const qty = +(group.get('quantity')!.value || 0);
    const price = +(group.get('unitPrice')!.value || 0);
    return +(qty * price).toFixed(2);
  }

  // ─────────────────────────────────────────────────────────
  //  CÁLCULO REACTIVO DEL TOTAL
  //  Fórmula: Subtotal + Impuestos + Delivery + Extra = TOTAL
  // ─────────────────────────────────────────────────────────
  private recalcTotals(): void {
    let sub = 0;
    for (let i = 0; i < this.items.length; i++) {
      sub += this.getItemSubtotal(i);
    }
    sub = +sub.toFixed(2);

    const rate = +(this.form.get('taxRate')!.value || 0);
    const delivery = +(this.form.get('deliveryFee')!.value || 0);
    const extra = +(this.form.get('extraFee')!.value || 0);
    const tax = +(sub * rate / 100).toFixed(2);

    this.subtotal.set(sub);
    this.taxAmount.set(tax);
    this.deliveryFeeValue.set(+delivery.toFixed(2));
    this.extraFeeValue.set(+extra.toFixed(2));
    this.total.set(+(sub + tax + delivery + extra).toFixed(2));
  }

  // ─────────────────────────────────────────────────────────
  //  GUARDADO
  // ─────────────────────────────────────────────────────────
  save(): void {
    if (this.isReadOnly()) return;

    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      this.items.controls.forEach(c => (c as FormGroup).markAllAsTouched());
      this.alertService.warning('Revisa los campos marcados antes de guardar.');
      return;
    }

    const id = this.quoteId();
    if (!id) return;

    this.isSaving.set(true);
    const payload = this.buildPayload();

    this.service.update(id, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          Swal.fire({
            icon: 'success',
            title: '¡Cotización actualizada!',
            html: `La cotización <strong>${this.quoteNumber()}</strong> fue actualizada exitosamente.`,
            confirmButtonText: 'Ir al listado',
            confirmButtonColor: '#50cd89',
          }).then(() => {
            this.router.navigate(['/cronos/cotizaciones']);
          });
        },
        error: err => {
          this.isSaving.set(false);
          const msg = err?.error?.message || 'No se pudo actualizar la cotización.';
          this.alertService.error(msg);
          Swal.fire({
            icon: 'error',
            title: 'Error al guardar',
            text: msg,
            confirmButtonColor: '#d33',
          });
        },
      });
  }

  private buildPayload(): CreateQuoteRequest {
    const v = this.form.getRawValue();
    return {
      clientName: v.clientName!,
      clientEmail: v.clientEmail || undefined,
      clientPhone: v.clientPhone || undefined,
      clientAddress: v.clientAddress || undefined,
      notes: v.notes || undefined,
      taxRate: v.taxRate!,
      currency: v.currency!,
      validDays: v.validDays!,
      deliveryFee: v.deliveryFee ?? 0,
      extraFee: v.extraFee ?? 0,
      extraFeeDescription: v.extraFeeDescription || undefined,
      items: (v.items as QuoteItemDetailResponse[]).map(item => ({
        recipeId: item.recipeId || undefined,
        productName: item.productName,
        productDescription: item.productDescription || undefined,
        productSize: item.productSize || undefined,
        quantity: item.quantity,
        unitCost: item.unitCost,
        profitPercentage: item.profitPercentage,
        unitPrice: item.unitPrice,
        notes: item.notes || undefined,
      } as QuoteItemRequest)),
    };
  }

  cancel(): void {
    this.router.navigate(['/cronos/cotizaciones']);
  }

  // ─────────────────────────────────────────────────────────
  //  HELPERS DE VALIDACIÓN (UI)
  // ─────────────────────────────────────────────────────────
  isFieldInvalid(field: string): boolean {
    const control = this.form.get(field);
    return !!control && control.invalid && control.touched;
  }

  isItemFieldInvalid(index: number, field: string): boolean {
    const control = this.getItemGroup(index).get(field);
    return !!control && control.invalid && control.touched;
  }

  // Etiqueta amigable del estado para el badge del header.
  statusLabel(): string {
    const s = (this.status() || '').toUpperCase();
    switch (s) {
      case 'DRAFT': return 'Borrador';
      case 'SENT': return 'Enviada';
      case 'ACCEPTED': return 'Aceptada';
      case 'REJECTED': return 'Rechazada';
      case 'EXPIRED': return 'Expirada';
      default: return s || '—';
    }
  }

  statusBadgeClass(): string {
    const s = (this.status() || '').toUpperCase();
    switch (s) {
      case 'DRAFT': return 'badge-light-secondary';
      case 'SENT': return 'badge-light-info';
      case 'ACCEPTED': return 'badge-light-success';
      case 'REJECTED': return 'badge-light-danger';
      case 'EXPIRED': return 'badge-light-warning';
      default: return 'badge-light';
    }
  }
}
