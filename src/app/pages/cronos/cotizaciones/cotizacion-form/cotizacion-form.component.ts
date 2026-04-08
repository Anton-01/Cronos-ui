import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormArray,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, takeUntil, of } from 'rxjs';
import { QuoteService } from 'src/app/core/services/domain/quote.service';
import {
  CreateQuoteRequest,
  QuoteItemRequest,
  RecipeSimpleResponse,
} from 'src/app/core/models/domain.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import { PageInfoService } from 'src/app/_metronic/layout/core/page-info.service';

@Component({
  selector: 'app-cotizacion-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AlertContainerComponent],
  templateUrl: './cotizacion-form.component.html',
})
export class CotizacionFormComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private service = inject(QuoteService);
  private alertService = inject(AlertService);
  private toastService = inject(ToastService);
  private pageInfoService = inject(PageInfoService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  isSaving = signal(false);

  // ─── Typeahead state ───
  recipeSearchSubject = new Subject<string>();
  recipeSuggestions = signal<RecipeSimpleResponse[]>([]);
  showSuggestions = signal<number | null>(null); // index of active row
  activeSearchIndex = signal(-1);

  // ─── Form ───
  form = this.fb.group({
    clientName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
    clientEmail: ['', [Validators.email, Validators.maxLength(255)]],
    clientPhone: ['', [Validators.maxLength(20)]],
    clientAddress: ['', [Validators.maxLength(500)]],
    notes: ['', [Validators.maxLength(1000)]],
    taxRate: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    currency: ['MXN', [Validators.required]],
    validDays: [15, [Validators.required, Validators.min(1), Validators.max(365)]],
    items: this.fb.array([], [Validators.minLength(1)]),
  });

  // ─── Computed totals ───
  subtotal = signal(0);
  taxAmount = signal(0);
  total = signal(0);

  currencies = ['MXN', 'USD', 'EUR', 'COP', 'ARS', 'CLP', 'PEN', 'GTQ'];

  get items(): FormArray {
    return this.form.get('items') as FormArray;
  }

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Nueva Cotización');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
      { title: 'Cotizaciones', path: '/cronos/cotizaciones', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
    ]);

    // Add first empty item
    this.addItem();

    // Recalc totals on any item change
    this.items.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.recalcTotals());

    this.form.get('taxRate')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.recalcTotals());

    // Typeahead search
    this.recipeSearchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(term =>
          term.length >= 2
            ? this.service.searchRecipes(term)
            : of({ data: [] } as any)
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(res => {
        this.recipeSuggestions.set(res.data || []);
        this.activeSearchIndex.set(-1);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Item CRUD ───
  createItemGroup(): FormGroup {
    return this.fb.group({
      recipeId: [''],
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

  // ─── Price Calculations ───
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
    const qty = group.get('quantity')!.value || 0;
    const price = group.get('unitPrice')!.value || 0;
    return +(qty * price).toFixed(2);
  }

  recalcTotals(): void {
    let sub = 0;
    for (let i = 0; i < this.items.length; i++) {
      sub += this.getItemSubtotal(i);
    }
    sub = +sub.toFixed(2);
    const rate = this.form.get('taxRate')!.value || 0;
    const tax = +(sub * rate / 100).toFixed(2);
    this.subtotal.set(sub);
    this.taxAmount.set(tax);
    this.total.set(+(sub + tax).toFixed(2));
  }

  // ─── Typeahead ───
  onRecipeSearch(event: Event, rowIndex: number): void {
    const value = (event.target as HTMLInputElement).value;
    this.showSuggestions.set(rowIndex);
    this.recipeSearchSubject.next(value);
  }

  selectRecipe(recipe: RecipeSimpleResponse, rowIndex: number): void {
    const group = this.getItemGroup(rowIndex);
    group.patchValue({
      recipeId: recipe.id,
      productName: recipe.name,
      productDescription: recipe.description || '',
      unitCost: recipe.costPerUnit || 0,
    });
    this.onCostOrProfitChange(rowIndex);
    this.closeSuggestions();
  }

  closeSuggestions(): void {
    this.showSuggestions.set(null);
    this.recipeSuggestions.set([]);
  }

  onSearchKeydown(event: KeyboardEvent, rowIndex: number): void {
    const suggestions = this.recipeSuggestions();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeSearchIndex.set(
        Math.min(this.activeSearchIndex() + 1, suggestions.length - 1)
      );
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeSearchIndex.set(Math.max(this.activeSearchIndex() - 1, 0));
    } else if (event.key === 'Enter' && this.activeSearchIndex() >= 0) {
      event.preventDefault();
      this.selectRecipe(suggestions[this.activeSearchIndex()], rowIndex);
    } else if (event.key === 'Escape') {
      this.closeSuggestions();
    }
  }

  // ─── Submit ───
  save(): void {
    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      this.items.controls.forEach(c => (c as FormGroup).markAllAsTouched());
      this.alertService.warning('Revisa los campos marcados antes de guardar.');
      return;
    }

    this.isSaving.set(true);

    const formVal = this.form.value;
    const payload: CreateQuoteRequest = {
      clientName: formVal.clientName!,
      clientEmail: formVal.clientEmail || undefined,
      clientPhone: formVal.clientPhone || undefined,
      clientAddress: formVal.clientAddress || undefined,
      notes: formVal.notes || undefined,
      taxRate: formVal.taxRate!,
      currency: formVal.currency!,
      validDays: formVal.validDays!,
      items: (formVal.items as any[]).map(item => ({
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

    this.service.create(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toastService.success('Cotización creada', 'Se ha generado la cotización exitosamente.');
        this.router.navigate(['/cronos/cotizaciones']);
      },
      error: err => {
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
