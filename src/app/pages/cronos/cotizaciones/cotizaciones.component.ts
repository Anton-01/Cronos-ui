import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { QuoteService } from 'src/app/core/services/domain/quote.service';
import { InternalQuoteResponse } from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import { PageInfoService } from 'src/app/_metronic/layout/core/page-info.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-cotizaciones',
  standalone: true,
  imports: [CommonModule, AlertContainerComponent],
  templateUrl: './cotizaciones.component.html',
})
export class CotizacionesComponent implements OnInit, OnDestroy {
  private service = inject(QuoteService);
  private alertService = inject(AlertService);
  private toastService = inject(ToastService);
  private pageInfoService = inject(PageInfoService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  items = signal<InternalQuoteResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  sendingEmailId = signal<string | null>(null);

  searchTerm = signal('');
  searchSubject = new Subject<string>();
  pageRequest: PageRequest = { page: 0, size: 10, sort: 'createdAt,desc' };

  // Dropdown state
  openDropdownId = signal<string | null>(null);

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Cotizaciones');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
      { title: 'Cotizaciones', path: '/cronos/cotizaciones', isActive: false },
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
        this.errorMessage.set(err?.error?.message || err?.message || 'Error al cargar cotizaciones');
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
    this.router.navigate(['/cronos/cotizaciones/nueva']);
  }

  toggleDropdown(id: string): void {
    this.openDropdownId.set(this.openDropdownId() === id ? null : id);
  }

  closeDropdown(): void {
    this.openDropdownId.set(null);
  }

  // ─── Distribución ───

  getPublicUrl(quote: InternalQuoteResponse): string {
    const base = window.location.origin;
    return `${base}/cronos/cotizaciones/ver/${quote.publicToken}`;
  }

  copyLink(quote: InternalQuoteResponse): void {
    const url = this.getPublicUrl(quote);
    navigator.clipboard.writeText(url).then(() => {
      this.toastService.success('Enlace copiado', 'El enlace de la cotización se copió al portapapeles.');
    }).catch(() => {
      this.alertService.error('No se pudo copiar el enlace. Copia manualmente: ' + url);
    });
    this.closeDropdown();
  }

  sendWhatsApp(quote: InternalQuoteResponse): void {
    const url = this.getPublicUrl(quote);
    const message = `¡Hola! Te comparto la cotización de tu pedido. Puedes ver los detalles y fotos aquí: ${url}`;
    let waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    if (quote.clientPhone) {
      const phone = quote.clientPhone.replace(/[^0-9]/g, '');
      waUrl += `&phone=${phone}`;
    }
    window.open(waUrl, '_blank');
    this.closeDropdown();
  }

  sendEmail(quote: InternalQuoteResponse): void {
    if (!quote.clientEmail) {
      Swal.fire({
        icon: 'error',
        title: 'Sin correo electrónico',
        html: 'Este cliente no tiene un correo registrado.<br>Edita la cotización para agregar uno antes de enviar.',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#3085d6',
      });
      this.closeDropdown();
      return;
    }

    this.sendingEmailId.set(quote.id);
    this.closeDropdown();

    this.service.sendEmail(quote.id).subscribe({
      next: () => {
        this.sendingEmailId.set(null);
        Swal.fire({
          icon: 'success',
          title: '¡Correo enviado!',
          html: `La cotización <strong>${quote.quoteNumber}</strong> fue enviada a <strong>${quote.clientEmail}</strong>.`,
          confirmButtonText: 'Listo',
          confirmButtonColor: '#50cd89',
        });
      },
      error: err => {
        this.sendingEmailId.set(null);
        Swal.fire({
          icon: 'error',
          title: 'Error al enviar',
          text: err?.error?.message || 'No se pudo enviar el correo. Intenta de nuevo.',
          confirmButtonText: 'Cerrar',
          confirmButtonColor: '#d33',
        });
      },
    });
  }

  revokeLink(quote: InternalQuoteResponse): void {
    this.closeDropdown();
    Swal.fire({
      title: '¿Revocar enlace?',
      html: `El enlace público de la cotización <strong>${quote.quoteNumber}</strong> dejará de funcionar. Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, revocar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.service.revoke(quote.id).subscribe({
          next: () => {
            this.load();
            Swal.fire({
              icon: 'success',
              title: 'Enlace revocado',
              text: 'El enlace público ha sido desactivado.',
              confirmButtonColor: '#50cd89',
            });
          },
          error: err => {
            this.alertService.error(err?.error?.message || 'Error al revocar el enlace');
          },
        });
      }
    });
  }

  confirmDelete(quote: InternalQuoteResponse): void {
    this.closeDropdown();
    Swal.fire({
      title: '¿Eliminar cotización?',
      html: `Se eliminará <strong>${quote.quoteNumber}</strong>. Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.service.delete(quote.id).subscribe({
          next: () => {
            this.load();
            this.alertService.success('Cotización eliminada correctamente');
          },
          error: err => {
            this.alertService.error(err?.error?.message || 'Error al eliminar');
          },
        });
      }
    });
  }

  // ─── Helpers ───
  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'DRAFT': return 'badge badge-light-warning';
      case 'SENT': return 'badge badge-light-info';
      case 'ACCEPTED': return 'badge badge-light-success';
      case 'REJECTED': return 'badge badge-light-danger';
      case 'REVOKED': return 'badge badge-light-dark';
      case 'EXPIRED': return 'badge badge-light-secondary';
      default: return 'badge badge-light';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'DRAFT': return 'Borrador';
      case 'SENT': return 'Enviada';
      case 'ACCEPTED': return 'Aceptada';
      case 'REJECTED': return 'Rechazada';
      case 'REVOKED': return 'Revocada';
      case 'EXPIRED': return 'Expirada';
      default: return status;
    }
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: currency || 'MXN',
      minimumFractionDigits: 2,
    }).format(amount);
  }
}
