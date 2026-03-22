import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { CategoryService } from 'src/app/core/services/domain/category.service';
import { MeasurementUnitService } from 'src/app/core/services/domain/measurement-unit.service';
import { AllergenService } from 'src/app/core/services/domain/allergen.service';
import { IngredientResponse, CategoryResponse, MeasurementUnitResponse, AllergenResponse } from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-ingredientes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './ingredientes.component.html',
})
export class IngredientesComponent implements OnInit {
  private ingredientService = inject(IngredientService);
  private categoryService = inject(CategoryService);
  private measurementUnitService = inject(MeasurementUnitService);
  private allergenService = inject(AllergenService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  items = signal<IngredientResponse[]>([]);
  categories = signal<CategoryResponse[]>([]);
  measurementUnits = signal<MeasurementUnitResponse[]>([]);
  allergens = signal<AllergenResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showForm = signal(false);
  selectedItem = signal<IngredientResponse | null>(null);
  showDeleteModal = signal(false);
  deletingItem = signal<IngredientResponse | null>(null);
  isDeleting = signal(false);
  isSaving = signal(false);
  selectedAllergenIds = signal<number[]>([]);

  pageRequest: PageRequest = { page: 0, size: 10, sort: 'name,asc' };
  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    categoryId: [null as number | null],
    measurementUnitId: [null as number | null],
  });

  ngOnInit(): void {
    this.load();
    this.loadRelations();
  }

  load(): void {
    this.isLoading.set(true);
    this.ingredientService.getAll(this.pageRequest).subscribe({
      next: res => { this.items.set(res.data.content); this.totalElements.set(res.data.totalElements); this.totalPages.set(res.data.totalPages); this.isLoading.set(false); },
      error: err => { this.errorMessage.set(err?.message || 'Error'); this.isLoading.set(false); },
    });
  }

  loadRelations(): void {
    this.categoryService.getAll({ page: 0, size: 100, sort: 'name,asc' }).subscribe({ next: res => this.categories.set(res.data.content) });
    this.measurementUnitService.getAll({ page: 0, size: 100, sort: 'name,asc' }).subscribe({ next: res => this.measurementUnits.set(res.data.content) });
    this.allergenService.getAll({ page: 0, size: 100, sort: 'name,asc' }).subscribe({ next: res => this.allergens.set(res.data.content) });
  }

  goToPage(page: number): void { this.pageRequest = { ...this.pageRequest, page }; this.load(); }
  get pages(): number[] { return Array.from({ length: this.totalPages() }, (_, i) => i); }

  openCreate(): void {
    this.selectedItem.set(null);
    this.form.reset();
    this.selectedAllergenIds.set([]);
    this.showForm.set(true);
  }

  openEdit(item: IngredientResponse): void {
    this.selectedItem.set(item);
    this.form.patchValue({ name: item.name, description: item.description ?? '', categoryId: item.category?.id ?? null, measurementUnitId: item.measurementUnit?.id ?? null });
    this.selectedAllergenIds.set(item.allergens.map(a => a.id));
    this.showForm.set(true);
  }

  closeForm(): void { this.showForm.set(false); this.selectedItem.set(null); }

  toggleAllergen(id: number): void {
    this.selectedAllergenIds.update(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
  }

  isAllergenSelected(id: number): boolean {
    return this.selectedAllergenIds().includes(id);
  }

  saveForm(): void {
    if (this.form.invalid) return;
    this.isSaving.set(true);
    const isEdit = !!this.selectedItem();
    const payload = {
      name: this.form.value.name!,
      description: this.form.value.description || undefined,
      categoryId: this.form.value.categoryId || undefined,
      measurementUnitId: this.form.value.measurementUnitId || undefined,
      allergenIds: this.selectedAllergenIds().length ? this.selectedAllergenIds() : undefined,
    };
    const obs = isEdit ? this.ingredientService.update({ id: this.selectedItem()!.id, ...payload }) : this.ingredientService.create(payload);
    obs.subscribe({
      next: () => { this.isSaving.set(false); this.closeForm(); this.load(); this.toast.success(isEdit ? 'Ingrediente actualizado' : 'Ingrediente creado'); },
      error: err => { this.isSaving.set(false); this.toast.error('Error', err?.message); },
    });
  }

  openDelete(item: IngredientResponse): void { this.deletingItem.set(item); this.showDeleteModal.set(true); }
  closeDeleteModal(): void { this.showDeleteModal.set(false); this.deletingItem.set(null); }

  confirmDelete(): void {
    const item = this.deletingItem();
    if (!item) return;
    this.isDeleting.set(true);
    this.ingredientService.delete(item.id).subscribe({
      next: () => { this.isDeleting.set(false); this.closeDeleteModal(); this.load(); this.toast.success('Ingrediente eliminado'); },
      error: err => { this.isDeleting.set(false); this.closeDeleteModal(); this.toast.error('Error al eliminar', err?.message); },
    });
  }
}
