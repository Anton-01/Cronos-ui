import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';

import { TranslatePipe } from '@ngx-translate/core';
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
import { LanguageService } from 'src/app/core/services/language.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';

type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

/** Quote lifecycle values the API returns; labels live under `QUOTES.STATUS`. */
const STATUS_VALUES: readonly string[] = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'REVOKED', 'EXPIRED'];

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
    TranslatePipe,
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
    TableSkeletonRowComponent,
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
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  readonly items = signal<InternalQuoteResponse[]>([]);
  readonly isLoading = signal(false);
  protected readonly skeletonRows = Array.from({ length: 6 });
  selectedItems: InternalQuoteResponse[] = [];
  readonly sendingEmailId = signal<string | null>(null);
  readonly actionMenuItems = signal<MenuItem[]>([]);

  readonly statusFilterOptions = computed<{ value: string; label: string }[]>(() =>
    STATUS_VALUES.map((value) => ({ value, label: this.language.t(`QUOTES.STATUS.${value}`) })),
  );

  constructor() {
    // Page chrome re-renders on a language switch; the fetch stays in ngOnInit.
    effect(() => {
      this.pageInfoService.updateTitle(this.language.t('QUOTES.TITLE'));
      this.pageInfoService.updateDescription(this.language.t('QUOTES.DESCRIPTION'));
      this.pageInfoService.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('QUOTES.TITLE'), path: '', isActive: true },
      ]);
    });
  }

  ngOnInit(): void {
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
        this.alertService.error(
          err?.error?.message || err?.message || this.language.t('QUOTES.TOAST.LOAD_FAILED'),
        );
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
      {
        label: this.language.t('QUOTES.ACTIONS.COPY_LINK'),
        icon: 'pi pi-copy',
        command: () => this.copyLink(quote),
      },
      {
        label: this.language.t('QUOTES.ACTIONS.SEND_WHATSAPP'),
        icon: 'pi pi-whatsapp',
        command: () => this.sendWhatsApp(quote),
      },
      {
        label: this.language.t('QUOTES.ACTIONS.SEND_EMAIL'),
        icon: 'pi pi-envelope',
        disabled: this.sendingEmailId() === quote.id,
        command: () => this.sendEmail(quote),
      },
      { separator: true },
      {
        label: this.language.t('QUOTES.ACTIONS.REVOKE_LINK'),
        icon: 'pi pi-ban',
        command: () => this.revokeLink(quote),
      },
      { label: this.language.t('COMMON.DELETE'), icon: 'pi pi-trash', command: () => this.confirmDelete(quote) },
    ]);
  }

  // ─── Distribution ───

  getPublicUrl(quote: InternalQuoteResponse): string {
    return `${window.location.origin}/cronos/cotizaciones/ver/${quote.publicToken}`;
  }

  copyLink(quote: InternalQuoteResponse): void {
    const url = this.getPublicUrl(quote);
    navigator.clipboard.writeText(url).then(
      () =>
        this.toastService.success(
          this.language.t('QUOTES.TOAST.LINK_COPIED_TITLE'),
          this.language.t('QUOTES.TOAST.LINK_COPIED'),
        ),
      () => this.alertService.error(this.language.t('QUOTES.TOAST.COPY_FAILED', { url })),
    );
  }

  sendWhatsApp(quote: InternalQuoteResponse): void {
    const url = this.getPublicUrl(quote);
    const message = this.language.t('QUOTES.WHATSAPP_MESSAGE', { url });
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
        this.alertService.success(
          this.language.t('QUOTES.TOAST.EMAIL_SENT', { number: quote.quoteNumber }),
          this.language.t('QUOTES.TOAST.EMAIL_SENT_TITLE'),
        );
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
            this.language.t('QUOTES.TOAST.NO_EMAIL'),
            this.language.t('QUOTES.TOAST.NO_EMAIL_TITLE'),
          );
        } else {
          this.alertService.error(
            backendMessage || this.language.t('QUOTES.TOAST.EMAIL_FAILED'),
            this.language.t('QUOTES.TOAST.EMAIL_FAILED_TITLE'),
          );
        }
      },
    });
  }

  async revokeLink(quote: InternalQuoteResponse): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: this.language.t('QUOTES.CONFIRM.REVOKE_TITLE'),
      message: this.language.t('QUOTES.CONFIRM.REVOKE_MESSAGE', { number: quote.quoteNumber }),
      acceptLabel: this.language.t('QUOTES.CONFIRM.REVOKE_ACCEPT'),
      severity: 'danger',
      icon: 'pi pi-ban',
    });
    if (!confirmed) {
      return;
    }
    this.quoteService.revoke(quote.id).subscribe({
      next: () => {
        this.load();
        this.alertService.success(
          this.language.t('QUOTES.TOAST.LINK_REVOKED'),
          this.language.t('QUOTES.TOAST.LINK_REVOKED_TITLE'),
        );
      },
      error: (err) => {
        this.alertService.error(err?.error?.message || this.language.t('QUOTES.TOAST.REVOKE_FAILED'));
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
        this.alertService.success(this.language.t('QUOTES.TOAST.DELETED'));
      },
      error: (err) => {
        this.alertService.error(err?.error?.message || this.language.t('COMMON.TOAST.DELETE_FAILED'));
      },
    });
  }

  // ─── Helpers ───

  getStatusSeverity(status: string): TagSeverity {
    return STATUS_SEVERITIES[status] ?? 'secondary';
  }

  getStatusLabel(status: string): string {
    return STATUS_VALUES.includes(status) ? this.language.t(`QUOTES.STATUS.${status}`) : status;
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
