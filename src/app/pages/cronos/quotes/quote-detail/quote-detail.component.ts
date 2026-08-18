import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MenuItem } from 'primeng/api';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MenuModule } from 'primeng/menu';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { QuoteService } from 'src/app/core/services/domain/quote.service';
import { BakerQuoteDetailResponse, InternalQuoteItemResponse } from 'src/app/core/models/domain.model';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { DetailSkeletonComponent } from 'src/app/shared/components/detail-skeleton/detail-skeleton.component';

type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  REVOKED: 'Revocada',
  EXPIRED: 'Expirada',
};

const STATUS_SEVERITIES: Record<string, TagSeverity> = {
  DRAFT: 'warn',
  SENT: 'info',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  REVOKED: 'contrast',
  EXPIRED: 'secondary',
};

@Component({
  selector: 'app-quote-detail',
  standalone: true,
  imports: [
    ButtonModule,
    CardModule,
    MenuModule,
    MessageModule,
    TableModule,
    TagModule,
    TooltipModule,
    DetailSkeletonComponent,
  ],
  templateUrl: './quote-detail.component.html',
  styleUrl: './quote-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteDetailComponent implements OnInit, OnDestroy {
  private readonly quoteService = inject(QuoteService);
  private readonly alertService = inject(AlertService);
  private readonly toastService = inject(ToastService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy$ = new Subject<void>();

  readonly quote = signal<BakerQuoteDetailResponse | null>(null);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly sendingEmail = signal(false);

  readonly shareMenuItems: MenuItem[] = [
    { label: 'Copiar enlace', icon: 'pi pi-copy', command: () => this.copyLink() },
    { label: 'Enviar por WhatsApp', icon: 'pi pi-whatsapp', command: () => this.sendWhatsApp() },
    { label: 'Enviar por correo', icon: 'pi pi-envelope', command: () => this.sendEmail() },
  ];

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
      { title: 'Cotizaciones', path: '/cronos/cotizaciones', isActive: false },
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
    this.quoteService.getDetails(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.quote.set(res.data);
          this.isLoading.set(false);
          this.pageInfoService.updateTitle(`Cotización ${res.data.quoteNumber}`);
        },
        error: (err) => {
          this.loadError.set(err?.error?.message || 'No se pudo cargar la cotización.');
          this.isLoading.set(false);
        },
      });
  }

  // ─── Navigation ───

  goBack(): void {
    this.router.navigate(['/cronos/cotizaciones']);
  }

  editQuote(): void {
    const quote = this.quote();
    if (quote) {
      this.router.navigate(['/cronos/cotizaciones/editar', quote.id]);
    }
  }

  // ─── Sharing ───

  getPublicUrl(): string {
    const quote = this.quote();
    if (!quote) {
      return '';
    }
    return `${window.location.origin}/cronos/cotizaciones/ver/${quote.publicToken}`;
  }

  copyLink(): void {
    const url = this.getPublicUrl();
    navigator.clipboard.writeText(url).then(
      () => this.toastService.success('Enlace copiado', 'El enlace se copió al portapapeles.'),
      () => this.alertService.error('No se pudo copiar el enlace.')
    );
  }

  sendWhatsApp(): void {
    const quote = this.quote();
    if (!quote) {
      return;
    }
    const url = this.getPublicUrl();
    const message = `¡Hola! Te comparto la cotización de tu pedido. Puedes ver los detalles aquí: ${url}`;
    let whatsAppUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    if (quote.clientPhone) {
      whatsAppUrl += `&phone=${quote.clientPhone.replace(/[^0-9]/g, '')}`;
    }
    window.open(whatsAppUrl, '_blank');
  }

  sendEmail(): void {
    const quote = this.quote();
    if (!quote) {
      return;
    }
    this.sendingEmail.set(true);

    this.quoteService.sendEmail(quote.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.sendingEmail.set(false);
          this.alertService.success(`La cotización ${quote.quoteNumber} fue enviada al cliente.`, '¡Correo enviado!');
        },
        error: (err) => {
          this.sendingEmail.set(false);
          this.alertService.error(err?.error?.message || 'No se pudo enviar el correo.', 'Error al enviar');
        },
      });
  }

  // ─── Helpers ───

  getStatusSeverity(status: string): TagSeverity {
    return STATUS_SEVERITIES[status] ?? 'secondary';
  }

  getStatusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  getItemSubtotal(item: InternalQuoteItemResponse): number {
    return item.subtotal ?? +(item.quantity * item.unitPrice).toFixed(2);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(amount);
  }

  formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  formatAccessDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  parseBrowser(browserInfo: string): string {
    if (!browserInfo) {
      return 'Navegador desconocido';
    }
    const match = browserInfo.match(/(Chrome|Firefox|Safari|Edge|Opera|MSIE|Trident)[\/\s]?(\d+)/i);
    if (match) {
      return `${match[1]} ${match[2]}`;
    }
    if (/mobile/i.test(browserInfo)) {
      return 'Navegador Móvil';
    }
    return browserInfo.length > 40 ? browserInfo.substring(0, 40) + '…' : browserInfo;
  }
}
