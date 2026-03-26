import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { RecipeResponse } from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import { PageInfoService } from 'src/app/_metronic/layout/core/page-info.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-recetas',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AlertContainerComponent],
  templateUrl: './recetas.component.html',
})
export class RecetasComponent implements OnInit, OnDestroy {
  private service = inject(RecipeService);
  private alertService = inject(AlertService);
  private pageInfoService = inject(PageInfoService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  items = signal<RecipeResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  searchTerm = signal('');
  searchSubject = new Subject<string>();
  pageRequest: PageRequest = { page: 0, size: 10, sort: 'name,asc' };

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Recetas');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
      { title: 'Recetas', path: '/cronos/recetas', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
    ]);
    this.load();

    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(term => {
        this.searchTerm.set(term);
        this.pageRequest = { ...this.pageRequest, page: 0 };
        this.load();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    const search = this.searchTerm().trim() || undefined;
    this.service.getAll(this.pageRequest, search).subscribe({
      next: res => {
        this.items.set(res.data.content);
        this.totalElements.set(res.data.totalElements);
        this.totalPages.set(res.data.totalPages);
        this.isLoading.set(false);
      },
      error: err => {
        this.errorMessage.set(err?.error?.message || err?.message || 'Error al cargar recetas');
        this.isLoading.set(false);
      },
    });
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchSubject.next(value);
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
    this.router.navigate(['/cronos/recetas/nueva']);
  }

  openDetail(item: RecipeResponse): void {
    this.router.navigate(['/cronos/recetas', item.id]);
  }

  openEdit(item: RecipeResponse): void {
    this.router.navigate(['/cronos/recetas/editar', item.id]);
  }

  getStatusBadgeClass(status: string): string {
    return status === 'ACTIVE' ? 'badge badge-light-success' : 'badge badge-light-warning';
  }

  getStatusLabel(status: string): string {
    return status === 'ACTIVE' ? 'Activa' : 'Borrador';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  confirmDelete(item: RecipeResponse): void {
    Swal.fire({
      title: '¿Eliminar receta?',
      html: `Se eliminará <strong>${item.name}</strong>. Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.service.delete(item.id).subscribe({
          next: () => {
            this.load();
            this.alertService.success('Receta eliminada correctamente');
          },
          error: err => {
            this.alertService.error(err?.error?.message || err?.message || 'Error al eliminar');
          },
        });
      }
    });
  }
}
