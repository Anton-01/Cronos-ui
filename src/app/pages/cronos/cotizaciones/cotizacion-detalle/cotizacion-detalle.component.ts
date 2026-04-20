import { Component, OnInit, OnDestroy, inject, signal, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { QuoteService } from 'src/app/core/services/domain/quote.service';
import { BakerQuoteDetailResponse, InternalQuoteItemResponse } from 'src/app/core/models/domain.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { PageInfoService } from 'src/app/_metronic/layout/core/page-info.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-cotizacion-detalle',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cotizacion-detalle.component.html',
})
export class CotizacionDetalleComponent implements OnInit, OnDestroy {
  private service = inject(QuoteService);
  private alertService = inject(AlertService);
  private toastService = inject(ToastService);
  private pageInfoService = inject(PageInfoService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  quote = signal<BakerQuoteDetailResponse | null>(null);
  isLoading = signal(true);
  loadError = signal<string | null>(null);
  sendingEmail = signal(false);
  showShareDropdown = signal(false);
  dropdownTop = signal(0);
  dropdownLeft = signal(0);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError.set('No se recibió un identificador de cotización.');
      this.isLoading.set(false);
      return;
    }

    this.pageInfoService.updateTitle('Detalle de Cotización');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
      { title: 'Cotizaciones', path: '/cronos/cotizaciones', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
      { title: 'Detalle', path: '', isActive: true },
    ]);

    this.loadQuote(id);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadQuote(id: string): void {
    this.isLoading.set(true);
    this.service.getDetails(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.quote.set(res.data);
          this.isLoading.set(false);
          this.pageInfoService.updateTitle(`Cotización ${res.data.quoteNumber}`);
        },
        error: err => {
          this.loadError.set(err?.error?.message || 'No se pudo cargar la cotización.');
          this.isLoading.set(false);
        },
      });
  }

  // ─── Navegación ───
  goBack(): void {
    this.router.navigate(['/cronos/cotizaciones']);
  }

  editQuote(): void {
    const q = this.quote();
    if (q) this.router.navigate(['/cronos/cotizaciones/editar', q.id]);
  }

  constructor(private elementRef: ElementRef) {}

  // ─── Compartir dropdown ───
  toggleShareDropdown(event: MouseEvent): void {
    event.stopPropagation();

    // Si ya está abierto, lo cerramos y terminamos
    if (this.showShareDropdown()) {
      this.showShareDropdown.set(false);
      return;
    }

    // Calcular posición
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 250; // Coincide con tu clase w-250px
    const menuHeight = 150; // Altura aproximada de tus 3 opciones

    let top = rect.bottom + 5;
    let left = rect.right - menuWidth;

    // Ajuste si se sale por la izquierda
    if (left < 10) left = 10;

    // Ajuste si se sale por abajo de la pantalla
    if (top + menuHeight > window.innerHeight) {
      top = rect.top - menuHeight - 5;
    }

    // Aplicar valores y abrir el menú
    this.dropdownTop.set(top);
    this.dropdownLeft.set(left);
    this.showShareDropdown.set(true);
  }

  @HostListener('document:click', ['$event'])
  closeDropdown(event: Event) {
    const clickAdentro = this.elementRef.nativeElement.contains(event.target);
    if (this.showShareDropdown() && !clickAdentro) {
      this.showShareDropdown.set(false);
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.showShareDropdown()) this.showShareDropdown.set(false);
  }

  getPublicUrl(): string {
    const q = this.quote();
    if (!q) return '';
    return `${window.location.origin}/cronos/cotizaciones/ver/${q.publicToken}`;
  }

  copyLink(): void {
    const url = this.getPublicUrl();
    navigator.clipboard.writeText(url).then(() => {
      this.toastService.success('Enlace copiado', 'El enlace se copió al portapapeles.');
    }).catch(() => {
      this.alertService.error('No se pudo copiar el enlace.');
    });
    this.showShareDropdown.set(false);
  }

  sendWhatsApp(): void {
    const q = this.quote();
    if (!q) return;
    const url = this.getPublicUrl();
    const message = `¡Hola! Te comparto la cotización de tu pedido. Puedes ver los detalles aquí: ${url}`;
    let waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    if (q.clientPhone) {
      const phone = q.clientPhone.replace(/[^0-9]/g, '');
      waUrl += `&phone=${phone}`;
    }
    window.open(waUrl, '_blank');
    this.showShareDropdown.set(false);
  }

  sendEmail(): void {
    const q = this.quote();
    if (!q) return;
    this.sendingEmail.set(true);
    this.showShareDropdown.set(false);

    this.service.sendEmail(q.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.sendingEmail.set(false);
          Swal.fire({
            icon: 'success',
            title: '¡Correo enviado!',
            html: `La cotización <strong>${q.quoteNumber}</strong> fue enviada al cliente.`,
            confirmButtonText: 'Listo',
            confirmButtonColor: '#50cd89',
          });
        },
        error: err => {
          this.sendingEmail.set(false);
          Swal.fire({
            icon: 'error',
            title: 'Error al enviar',
            text: err?.error?.message || 'No se pudo enviar el correo.',
            confirmButtonColor: '#d33',
          });
        },
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

  getItemSubtotal(item: InternalQuoteItemResponse): number {
    return item.subtotal ?? +(item.quantity * item.unitPrice).toFixed(2);
  }

  formatAccessDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('es-MX', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  parseBrowser(browserInfo: string): string {
    if (!browserInfo) return 'Navegador desconocido';
    const match = browserInfo.match(/(Chrome|Firefox|Safari|Edge|Opera|MSIE|Trident)[\/\s]?(\d+)/i);
    if (match) return `${match[1]} ${match[2]}`;
    if (/mobile/i.test(browserInfo)) return 'Navegador Móvil';
    return browserInfo.length > 40 ? browserInfo.substring(0, 40) + '…' : browserInfo;
  }
}
