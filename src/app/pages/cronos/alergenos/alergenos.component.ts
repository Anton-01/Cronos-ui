import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AllergenService } from 'src/app/core/services/domain/allergen.service';
import { AllergenResponse } from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-alergenos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './alergenos.component.html',
})
export class AlergenosComponent implements OnInit {
  private allergenService = inject(AllergenService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  items = signal<AllergenResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showForm = signal(false);
  selectedItem = signal<AllergenResponse | null>(null);
  showDeleteModal = signal(false);
  deletingItem = signal<AllergenResponse | null>(null);
  isDeleting = signal(false);
  isSaving = signal(false);

  pageRequest: PageRequest = { page: 0, size: 10, sort: 'name,asc' };

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    icon: [''],
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.isLoading.set(true);
    this.allergenService.getAll(this.pageRequest).subscribe({
      next: res => { this.items.set(res.data.content); this.totalElements.set(res.data.totalElements); this.totalPages.set(res.data.totalPages); this.isLoading.set(false); },
      error: err => { this.errorMessage.set(err?.message || 'Error al cargar alérgenos'); this.isLoading.set(false); },
    });
  }

  goToPage(page: number): void { this.pageRequest = { ...this.pageRequest, page }; this.load(); }
  get pages(): number[] { return Array.from({ length: this.totalPages() }, (_, i) => i); }

  openCreate(): void { this.selectedItem.set(null); this.form.reset(); this.showForm.set(true); }
  openEdit(item: AllergenResponse): void { this.selectedItem.set(item); this.form.patchValue({ name: item.name, description: item.description ?? '', icon: item.icon ?? '' }); this.showForm.set(true); }
  closeForm(): void { this.showForm.set(false); this.selectedItem.set(null); }

  saveForm(): void {
    if (this.form.invalid) return;
    this.isSaving.set(true);
    const isEdit = !!this.selectedItem();
    const payload = { name: this.form.value.name!, description: this.form.value.description || undefined, icon: this.form.value.icon || undefined };

    const obs = isEdit
      ? this.allergenService.update({ id: this.selectedItem()!.id, ...payload })
      : this.allergenService.create(payload);

    obs.subscribe({
      next: () => { this.isSaving.set(false); this.closeForm(); this.load(); this.toast.success(isEdit ? 'Alérgeno actualizado' : 'Alérgeno creado'); },
      error: err => { this.isSaving.set(false); this.toast.error('Error', err?.message); },
    });
  }

  openDelete(item: AllergenResponse): void { this.deletingItem.set(item); this.showDeleteModal.set(true); }
  closeDeleteModal(): void { this.showDeleteModal.set(false); this.deletingItem.set(null); }

  confirmDelete(): void {
    const item = this.deletingItem();
    if (!item) return;
    this.isDeleting.set(true);
    this.allergenService.delete(item.id).subscribe({
      next: () => { this.isDeleting.set(false); this.closeDeleteModal(); this.load(); this.toast.success('Alérgeno eliminado'); },
      error: err => { this.isDeleting.set(false); this.closeDeleteModal(); this.toast.error('Error al eliminar', err?.message); },
    });
  }
}
