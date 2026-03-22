import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AllergenService } from 'src/app/core/services/domain/allergen.service';
import { AllergenResponse } from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-alergenos',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, AlertContainerComponent],
  templateUrl: './alergenos.component.html',
})
export class AlergenosComponent implements OnInit {
  private allergenService = inject(AllergenService);
  private alertService = inject(AlertService);
  private fb = inject(FormBuilder);

  items = signal<AllergenResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showForm = signal(false);
  selectedItem = signal<AllergenResponse | null>(null);
  isSaving = signal(false);

  searchTerm = '';
  pageRequest: PageRequest = { page: 0, size: 10, sort: 'name,asc' };

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    alternativeName: [''],
    description: [''],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.allergenService.getAll(this.pageRequest, this.searchTerm || undefined).subscribe({
      next: res => {
        this.items.set(res.data.content);
        this.totalElements.set(res.data.totalElements);
        this.totalPages.set(res.data.totalPages);
        this.isLoading.set(false);
      },
      error: err => {
        this.errorMessage.set(err?.message || 'Error al cargar alérgenos');
        this.isLoading.set(false);
      },
    });
  }

  onSearch(): void {
    this.pageRequest = { ...this.pageRequest, page: 0 };
    this.load();
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.pageRequest = { ...this.pageRequest, page };
    this.load();
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages() }, (_, i) => i);
  }

  getStatusBadgeClass(status: string): string {
    return status === 'ACTIVE' ? 'badge badge-light-success' : 'badge badge-light-danger';
  }

  getStatusLabel(status: string): string {
    return status === 'ACTIVE' ? 'Activo' : 'Inactivo';
  }

  openCreate(): void {
    this.selectedItem.set(null);
    this.form.reset();
    this.showForm.set(true);
  }

  openEdit(item: AllergenResponse): void {
    this.selectedItem.set(item);
    this.form.patchValue({
      name: item.name,
      alternativeName: item.alternativeName ?? '',
      description: item.description ?? '',
    });
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
    const payload = {
      name: this.form.value.name!,
      alternativeName: this.form.value.alternativeName || undefined,
      description: this.form.value.description || undefined,
    };

    const obs = isEdit
      ? this.allergenService.update({ id: this.selectedItem()!.id, ...payload })
      : this.allergenService.create(payload);

    obs.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeForm();
        this.load();
        this.alertService.success(isEdit ? 'Alérgeno actualizado correctamente' : 'Alérgeno creado correctamente');
      },
      error: err => {
        this.isSaving.set(false);
        this.alertService.error(err?.message || 'Error al guardar');
      },
    });
  }

  confirmDelete(item: AllergenResponse): void {
    Swal.fire({
      title: '¿Eliminar alérgeno?',
      html: `Se eliminará <strong>${item.name}</strong>. Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.allergenService.delete(item.id).subscribe({
          next: () => {
            this.load();
            this.alertService.success('Alérgeno eliminado correctamente');
          },
          error: err => {
            this.alertService.error(err?.message || 'Error al eliminar');
          },
        });
      }
    });
  }
}
