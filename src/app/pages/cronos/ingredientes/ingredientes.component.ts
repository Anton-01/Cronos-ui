import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { IngredientResponse } from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import { PageInfoService } from 'src/app/_metronic/layout/core/page-info.service';
import Swal from 'sweetalert2';
import {StatusToggleComponent} from "../../../shared/components/modal-toggle-status/status-toggle.component";

@Component({
  selector: 'app-ingredientes',
  standalone: true,
  imports: [CommonModule, AlertContainerComponent, StatusToggleComponent],
  templateUrl: './ingredientes.component.html',
})
export class IngredientesComponent implements OnInit {
  private ingredientService = inject(IngredientService);
  private alertService = inject(AlertService);
  private pageInfoService = inject(PageInfoService);
  private router = inject(Router);

  items = signal<IngredientResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  searchTerm = signal('');
  pageRequest: PageRequest = { page: 0, size: 10, sort: 'name,asc' };

  filteredItems = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const all = this.items();
    if (!term) return all;
    return all.filter(item =>
      item.name.toLowerCase().includes(term) ||
      (item.categoryName && item.categoryName.toLowerCase().includes(term)) ||
      (item.purchaseUnitCode && item.purchaseUnitCode.toLowerCase().includes(term))
    );
  });

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Ingredientes');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
      { title: 'Cronos', path: '/dashboard', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
    ]);
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.ingredientService.getAll(this.pageRequest).subscribe({
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

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.pageRequest = { ...this.pageRequest, page };
    this.load();
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages() }, (_, i) => i);
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

  protected updateItemStatusInSignal(id: string, newStatus: "ACTIVE" | "INACTIVE") {
    this.items.update(currentItems =>
      currentItems.map(item =>
        item.id === id ? { ...item, status: newStatus } : item
      )
    );
  }
}
