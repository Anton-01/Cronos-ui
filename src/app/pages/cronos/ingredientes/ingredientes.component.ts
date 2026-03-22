import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { IngredientResponse } from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-ingredientes',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertContainerComponent],
  templateUrl: './ingredientes.component.html',
})
export class IngredientesComponent implements OnInit {
  private ingredientService = inject(IngredientService);
  private alertService = inject(AlertService);
  private router = inject(Router);

  items = signal<IngredientResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  searchTerm = '';
  pageRequest: PageRequest = { page: 0, size: 10, sort: 'name,asc' };

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.ingredientService.getAll(this.pageRequest, this.searchTerm || undefined).subscribe({
      next: res => {
        this.items.set(res.data.content);
        this.totalElements.set(res.data.totalElements);
        this.totalPages.set(res.data.totalPages);
        this.isLoading.set(false);
      },
      error: err => {
        this.errorMessage.set(err?.message || 'Error al cargar ingredientes');
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
    this.router.navigate(['/cronos/ingredientes/nuevo']);
  }

  openEdit(item: IngredientResponse): void {
    this.router.navigate(['/cronos/ingredientes/editar', item.id]);
  }

  confirmDelete(item: IngredientResponse): void {
    Swal.fire({
      title: '¿Eliminar ingrediente?',
      html: `Se eliminará <strong>${item.name}</strong>. Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.ingredientService.delete(item.id).subscribe({
          next: () => {
            this.load();
            this.alertService.success('Ingrediente eliminado correctamente');
          },
          error: err => {
            this.alertService.error(err?.message || 'Error al eliminar');
          },
        });
      }
    });
  }

  formatCurrency(value: number): string {
    return '$' + value.toFixed(2);
  }

  formatPercentage(value: number): string {
    return value.toFixed(2) + '%';
  }

  formatQuantity(value: number): string {
    return value.toFixed(4);
  }
}
