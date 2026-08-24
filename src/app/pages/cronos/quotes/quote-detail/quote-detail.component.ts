import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MenuItem } from 'primeng/api';

import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MenuModule } from 'primeng/menu';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { QuoteService } from 'src/app/core/services/domain/quote.service';
import { BakerQuoteDetailResponse, InternalQuoteItemResponse } from 'src/app/core/models/domain.model';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { DetailSkeletonComponent } from 'src/app/shared/components/detail-skeleton/detail-skeleton.component';

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
  selector: 'app-quote-detail',
  standalone: true,
  imports: [
    TranslatePipe,
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
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy$ = new Subject<void>();

  readonly quote = signal<BakerQuoteDetailResponse | null>(null);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly sendingEmail = signal(false);

  readonly shareMenuItems = computed<MenuItem[]>(() => [
    {
      label: this.language.t('QUOTES.ACTIONS.COPY_LINK'),
      icon: 'pi pi-copy',
      command: () => this.copyLink(),
    },
    {
      label: this.language.t('QUOTES.ACTIONS.SEND_WHATSAPP'),
      icon: 'pi pi-whatsapp',
      command: () => this.sendWhatsApp(),
    },
    {
      label: this.language.t('QUOTES.ACTIONS.SEND_EMAIL'),
      icon: 'pi pi-envelope',
      command: () => this.sendEmail(),
    },
  ]);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError.set(this.language.t('QUOTES.DETAIL.NO_ID'));
      this.isLoading.set(false);
      return;
    }

    this.pageInfoService.updateTitle(this.language.t('QUOTES.DETAIL.TITLE'));
    this.pageInfoService.updateBreadcrumbs([
      { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
      { title: this.language.t('QUOTES.TITLE'), path: '/cronos/cotizaciones', isActive: false },
      { title: this.language.t('COMMON.DETAIL'), path: '', isActive: true },
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
          this.pageInfoService.updateTitle(
            this.language.t('QUOTES.DETAIL.TITLE_NUMBERED', { number: res.data.quoteNumber }),
          );
        },
        error: (err) => {
          this.loadError.set(err?.error?.message || this.language.t('QUOTES.DETAIL.LOAD_FAILED'));
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
      () =>
        this.toastService.success(
          this.language.t('QUOTES.TOAST.LINK_COPIED_TITLE'),
          this.language.t('QUOTES.DETAIL.LINK_COPIED'),
        ),
      () => this.alertService.error(this.language.t('QUOTES.DETAIL.COPY_FAILED')),
    );
  }

  sendWhatsApp(): void {
    const quote = this.quote();
    if (!quote) {
      return;
    }
    const url = this.getPublicUrl();
    const message = this.language.t('QUOTES.DETAIL.WHATSAPP_MESSAGE', { url });
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
          this.alertService.success(
            this.language.t('QUOTES.TOAST.EMAIL_SENT', { number: quote.quoteNumber }),
            this.language.t('QUOTES.TOAST.EMAIL_SENT_TITLE'),
          );
        },
        error: (err) => {
          this.sendingEmail.set(false);
          this.alertService.error(
            err?.error?.message || this.language.t('QUOTES.DETAIL.EMAIL_FAILED'),
            this.language.t('QUOTES.TOAST.EMAIL_FAILED_TITLE'),
          );
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

  getItemSubtotal(item: InternalQuoteItemResponse): number {
    return item.subtotal ?? +(item.quantity * item.unitPrice).toFixed(2);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat(this.language.current(), {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
    }).format(amount);
  }

  formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString(this.language.current(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  formatAccessDate(date: Date | string): string {
    return new Date(date).toLocaleDateString(this.language.current(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  parseBrowser(browserInfo: string): string {
    if (!browserInfo) {
      return this.language.t('QUOTES.DETAIL.UNKNOWN_BROWSER');
    }
    const match = browserInfo.match(/(Chrome|Firefox|Safari|Edge|Opera|MSIE|Trident)[\/\s]?(\d+)/i);
    if (match) {
      return `${match[1]} ${match[2]}`;
    }
    if (/mobile/i.test(browserInfo)) {
      return this.language.t('QUOTES.DETAIL.MOBILE_BROWSER');
    }
    return browserInfo.length > 40 ? browserInfo.substring(0, 40) + '…' : browserInfo;
  }
}
