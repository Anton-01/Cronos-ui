import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MenuModule } from 'primeng/menu';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { QuoteService } from 'src/app/core/services/domain/quote.service';
import { InternalQuoteResponse } from 'src/app/core/models/domain.model';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { ToastService } from 'src/app/shared/services/toast.service';

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
  selector: 'app-quotes',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MenuModule,
    SelectModule,
    TableModule,
    TagModule,
    TooltipModule,
  ],
  templateUrl: './quotes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuotesComponent implements OnInit {
  private readonly quoteService = inject(QuoteService);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly router = inject(Router);

  readonly items = signal<InternalQuoteResponse[]>([]);
  readonly isLoading = signal(false);
  selectedItems: InternalQuoteResponse[] = [];
  readonly sendingEmailId = signal<string | null>(null);
  readonly actionMenuItems = signal<MenuItem[]>([]);

  readonly statusFilterOptions = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Cotizaciones');
    this.pageInfoService.updateDescription('Genera y comparte cotizaciones con tus clientes');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: 'Cotizaciones', path: '', isActive: true },
    ]);
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.quoteService.getAll({ page: 0, size: 1000, sort: 'createdAt,desc' }).subscribe({
      next: (res) => {
        this.items.set(res.data.content);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.error(err?.error?.message || err?.message || 'Error al cargar cotizaciones');
      },
    });
  }

  openCreate(): void {
    this.router.navigate(['/cronos/cotizaciones/nueva']);
  }

  viewQuoteDetails(quote: InternalQuoteResponse): void {
    this.router.navigate(['/cronos/cotizaciones/detalles', quote.id]);
  }

  editQuote(quote: InternalQuoteResponse): void {
    this.router.navigate(['/cronos/cotizaciones/editar', quote.id]);
  }

  buildActionMenu(quote: InternalQuoteResponse): void {
    this.actionMenuItems.set([
      { label: 'Copiar enlace', icon: 'pi pi-copy', command: () => this.copyLink(quote) },
      { label: 'Enviar por WhatsApp', icon: 'pi pi-whatsapp', command: () => this.sendWhatsApp(quote) },
      {
        label: 'Enviar por correo',
        icon: 'pi pi-envelope',
        disabled: this.sendingEmailId() === quote.id,
        command: () => this.sendEmail(quote),
      },
      { separator: true },
      { label: 'Revocar enlace', icon: 'pi pi-ban', command: () => this.revokeLink(quote) },
      { label: 'Eliminar', icon: 'pi pi-trash', command: () => this.confirmDelete(quote) },
    ]);
  }

  // ─── Distribution ───

  getPublicUrl(quote: InternalQuoteResponse): string {
    return `${window.location.origin}/cronos/cotizaciones/ver/${quote.publicToken}`;
  }

  copyLink(quote: InternalQuoteResponse): void {
    const url = this.getPublicUrl(quote);
    navigator.clipboard.writeText(url).then(
      () => this.toastService.success('Enlace copiado', 'El enlace de la cotización se copió al portapapeles.'),
      () => this.alertService.error('No se pudo copiar el enlace. Copia manualmente: ' + url)
    );
  }

  sendWhatsApp(quote: InternalQuoteResponse): void {
    const url = this.getPublicUrl(quote);
    const message = `¡Hola! Te comparto la cotización de tu pedido. Puedes ver los detalles y fotos aquí: ${url}`;
    let whatsAppUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    if (quote.clientPhone) {
      whatsAppUrl += `&phone=${quote.clientPhone.replace(/[^0-9]/g, '')}`;
    }
    window.open(whatsAppUrl, '_blank');
  }

  sendEmail(quote: InternalQuoteResponse): void {
    // The list endpoint may not include the email; trust the backend to validate
    // and surface a specific error if the client has no email registered.
    this.sendingEmailId.set(quote.id);

    this.quoteService.sendEmail(quote.id).subscribe({
      next: () => {
        this.sendingEmailId.set(null);
        this.alertService.success(`La cotización ${quote.quoteNumber} fue enviada al cliente.`, '¡Correo enviado!');
      },
      error: (err) => {
        this.sendingEmailId.set(null);
        const backendMessage: string = err?.error?.message || '';
        const looksLikeMissingEmail =
          err?.status === 400 &&
          /email|correo/i.test(backendMessage) &&
          /(no|sin|falta|missing|required|registr)/i.test(backendMessage);

        if (looksLikeMissingEmail) {
          this.alertService.error(
            'Este cliente no tiene un correo registrado. Edita la cotización para agregar uno antes de enviar.',
            'Sin correo electrónico'
          );
        } else {
          this.alertService.error(backendMessage || 'No se pudo enviar el correo. Intenta de nuevo.', 'Error al enviar');
        }
      },
    });
  }

  async revokeLink(quote: InternalQuoteResponse): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: '¿Revocar enlace?',
      message: `El enlace público de la cotización "${quote.quoteNumber}" dejará de funcionar. Esta acción no se puede deshacer.`,
      acceptLabel: 'Sí, revocar',
      severity: 'danger',
      icon: 'pi pi-ban',
    });
    if (!confirmed) {
      return;
    }
    this.quoteService.revoke(quote.id).subscribe({
      next: () => {
        this.load();
        this.alertService.success('El enlace público ha sido desactivado.', 'Enlace revocado');
      },
      error: (err) => {
        this.alertService.error(err?.error?.message || 'Error al revocar el enlace');
      },
    });
  }

  async confirmDelete(quote: InternalQuoteResponse): Promise<void> {
    const confirmed = await this.confirmService.confirmDelete(quote.quoteNumber);
    if (!confirmed) {
      return;
    }
    this.quoteService.delete(quote.id).subscribe({
      next: () => {
        this.load();
        this.alertService.success('Cotización eliminada correctamente');
      },
      error: (err) => {
        this.alertService.error(err?.error?.message || 'Error al eliminar');
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

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: currency || 'MXN',
      minimumFractionDigits: 2,
    }).format(amount);
  }
}
