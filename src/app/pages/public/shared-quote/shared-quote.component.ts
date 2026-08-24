import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, takeUntil } from 'rxjs';
import { LanguageService } from 'src/app/core/services/language.service';
import { PublicQuoteService } from 'src/app/core/services/domain/public-quote.service';
import { PublicQuoteResponse } from 'src/app/core/models/domain.model';

@Component({
    selector: 'app-shared-quote',
    imports: [TranslatePipe, CommonModule],
    templateUrl: './shared-quote.component.html',
    styleUrl: './shared-quote.component.scss',
    styles: [`
    :host { display: block; }

    .quote-invoice {
      max-width: 900px;
      margin: 0 auto;
    }

    .item-image {
      width: 80px;
      height: 80px;
      object-fit: cover;
      border-radius: 8px;
      border: 1px solid #f1f1f4;
    }

    .item-image-placeholder {
      width: 80px;
      height: 80px;
      border-radius: 8px;
      background: #f9f9fc;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .blocked-overlay {
      position: relative;
    }

    .blocked-overlay::after {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, 0.85);
      z-index: 5;
      border-radius: inherit;
    }

    @media print {
      .no-print { display: none !important; }
    }
  `]
})
export class SharedQuoteComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);
  private publicQuoteService = inject(PublicQuoteService);
  private destroy$ = new Subject<void>();

  quote = signal<PublicQuoteResponse | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  isBlocked = computed(() => {
    const q = this.quote();
    if (!q) return false;
    return q.isExpired || q.status === 'REVOKED';
  });

  blockedReason = computed(() => {
    const q = this.quote();
    if (!q) return '';
    if (q.status === 'REVOKED') return this.language.t('PUBLIC.QUOTE.REVOKED_REASON');
    if (q.isExpired) return this.language.t('PUBLIC.QUOTE.EXPIRED_REASON');
    return '';
  });

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.error.set(this.language.t('PUBLIC.INVALID_LINK'));
      this.loading.set(false);
      return;
    }

    this.publicQuoteService.getByToken(token)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.quote.set(res.data);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(this.language.t('PUBLIC.QUOTE.LOAD_FAILED'));
          this.loading.set(false);
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  formatCurrency(amount: number): string {
    const q = this.quote();
    return new Intl.NumberFormat(this.language.current(), {
      style: 'currency',
      currency: q?.currency || 'MXN',
      minimumFractionDigits: 2,
    }).format(amount);
  }

  getStatusBadge(): { class: string; label: string } {
    const q = this.quote();
    if (!q) return { class: 'public-badge', label: '' };
    switch (q.status) {
      case 'SENT':
        return { class: 'public-badge public-badge-info', label: this.language.t('PUBLIC.QUOTE.PENDING') };
      case 'ACCEPTED':
        return { class: 'public-badge public-badge-success', label: this.language.t('QUOTES.STATUS.ACCEPTED') };
      case 'REJECTED':
        return { class: 'public-badge public-badge-danger', label: this.language.t('QUOTES.STATUS.REJECTED') };
      case 'REVOKED':
        return { class: 'public-badge public-badge-dark', label: this.language.t('QUOTES.STATUS.REVOKED') };
      case 'EXPIRED':
        return { class: 'public-badge public-badge-warn', label: this.language.t('QUOTES.STATUS.EXPIRED') };
      default:
        return { class: 'public-badge public-badge-info', label: this.language.t('PUBLIC.QUOTE.BADGE_DEFAULT') };
    }
  }

  print(): void {
    window.print();
  }
}
