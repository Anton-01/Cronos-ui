import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { PublicQuoteService } from 'src/app/core/services/domain/public-quote.service';
import { PublicQuoteResponse } from 'src/app/core/models/domain.model';

@Component({
  selector: 'app-shared-quote',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shared-quote.component.html',
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
  `],
})
export class SharedQuoteComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
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
    if (q.status === 'REVOKED') return 'Esta cotización ha sido revocada por el vendedor.';
    if (q.isExpired) return 'Esta cotización ha expirado y ya no es válida.';
    return '';
  });

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.error.set('Enlace inválido.');
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
          this.error.set('No se pudo cargar la cotización. El enlace puede haber expirado o no ser válido.');
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
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: q?.currency || 'MXN',
      minimumFractionDigits: 2,
    }).format(amount);
  }

  getStatusBadge(): { class: string; label: string } {
    const q = this.quote();
    if (!q) return { class: 'badge badge-light', label: '' };
    switch (q.status) {
      case 'SENT': return { class: 'badge badge-light-info', label: 'Pendiente' };
      case 'ACCEPTED': return { class: 'badge badge-light-success', label: 'Aceptada' };
      case 'REJECTED': return { class: 'badge badge-light-danger', label: 'Rechazada' };
      case 'REVOKED': return { class: 'badge badge-light-dark', label: 'Revocada' };
      case 'EXPIRED': return { class: 'badge badge-light-secondary', label: 'Expirada' };
      default: return { class: 'badge badge-light-primary', label: 'Cotización' };
    }
  }

  print(): void {
    window.print();
  }
}
