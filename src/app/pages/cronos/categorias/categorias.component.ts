import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CategoryService } from 'src/app/core/services/domain/category.service';
import { CategoryResponse } from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-categorias',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './categorias.component.html',
})
export class CategoriasComponent implements OnInit {
  private categoryService = inject(CategoryService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  items = signal<CategoryResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showForm = signal(false);
  selectedItem = signal<CategoryResponse | null>(null);
  showDeleteModal = signal(false);
  deletingItem = signal<CategoryResponse | null>(null);
  isDeleting = signal(false);
  isSaving = signal(false);

  pageRequest: PageRequest = { page: 0, size: 10, sort: 'name,asc' };

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.categoryService.getAll(this.pageRequest).subscribe({
      next: res => {
        this.items.set(res.data.content);
        this.totalElements.set(res.data.totalElements);
        this.totalPages.set(res.data.totalPages);
        this.isLoading.set(false);
      },
      error: err => {
        this.errorMessage.set(err?.message || 'Error al cargar categorías');
        this.isLoading.set(false);
      },
    });
  }

  goToPage(page: number): void {
    this.pageRequest = { ...this.pageRequest, page };
    this.load();
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages() }, (_, i) => i);
  }

  openCreate(): void {
    this.selectedItem.set(null);
    this.form.reset();
    this.showForm.set(true);
  }

  openEdit(item: CategoryResponse): void {
    this.selectedItem.set(item);
    this.form.patchValue({ name: item.name, description: item.description ?? '' });
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.selectedItem.set(null);
  }

  saveForm(): void {
    if (this.form.invalid) return;
    this.isSaving.set(true);
    const isEdit = !!this.selectedItem();

    if (isEdit) {
      this.categoryService.update({
        id: this.selectedItem()!.id,
        name: this.form.value.name!,
        description: this.form.value.description || undefined,
      }).subscribe({
        next: () => {
          this.isSaving.set(false);
          this.closeForm();
          this.load();
          this.toast.success('Categoría actualizada');
        },
        error: err => {
          this.isSaving.set(false);
          this.toast.error('Error al actualizar', err?.message);
        },
      });
    } else {
      this.categoryService.create({
        name: this.form.value.name!,
        description: this.form.value.description || undefined,
      }).subscribe({
        next: () => {
          this.isSaving.set(false);
          this.closeForm();
          this.load();
          this.toast.success('Categoría creada');
        },
        error: err => {
          this.isSaving.set(false);
          this.toast.error('Error al crear', err?.message);
        },
      });
    }
  }

  openDelete(item: CategoryResponse): void {
    this.deletingItem.set(item);
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.deletingItem.set(null);
  }

  confirmDelete(): void {
    const item = this.deletingItem();
    if (!item) return;
    this.isDeleting.set(true);
    this.categoryService.delete(item.id).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.closeDeleteModal();
        this.load();
        this.toast.success('Categoría eliminada');
      },
      error: err => {
        this.isDeleting.set(false);
        this.closeDeleteModal();
        this.toast.error('Error al eliminar', err?.message);
      },
    });
  }
}
