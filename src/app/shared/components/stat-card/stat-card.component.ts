import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SkeletonModule } from 'primeng/skeleton';

/** The closed accent set from Context.md §12.2. A fifth metric reuses one of these. */
export type StatCardAccent = 'green' | 'slate' | 'navy' | 'amber';

/**
 * Freya dashboard metric card (Context.md §15).
 *
 * Layout is fixed by the design system: small label top-left, subtly styled
 * icon top-right, large figure bottom-left, optional caption under it. Every
 * metric tile in the app renders through this component — no page hand-rolls
 * a colored card.
 *
 * Passing `link` turns the card into an `<a routerLink>` and enables the
 * hover lift (§13.3); without it the card is inert and non-focusable.
 */
@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, SkeletonModule],
  template: `
    <ng-template #content>
      <div class="flex align-items-start justify-content-between gap-3">
        <span class="stat-card-label">{{ label() }}</span>
        <i class="stat-card-icon" [class]="icon()" aria-hidden="true"></i>
      </div>

      <div class="stat-card-body">
        @if (loading()) {
          <p-skeleton width="6rem" height="2rem" styleClass="stat-card-skeleton" />
        } @else {
          <span class="stat-card-value">{{ value() }}</span>
        }
        @if (caption()) {
          <span class="stat-card-caption">{{ caption() }}</span>
        }
      </div>
    </ng-template>

    @if (link(); as route) {
      <a class="stat-card" [class]="accentClass()" [routerLink]="route">
        <ng-container [ngTemplateOutlet]="content" />
      </a>
    } @else {
      <div class="stat-card" [class]="accentClass()">
        <ng-container [ngTemplateOutlet]="content" />
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .stat-card {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 1.5rem;
        height: 100%;
        min-height: 8.5rem;
        padding: 1.5rem;
        border-radius: var(--radius-lg);
        color: #fff;
        text-decoration: none;
        /* A neutral gray shadow under a saturated card reads as dirt, so each
           accent carries its own tinted shadow (§13.3). */
        box-shadow: 0 8px 20px -8px var(--stat-card-shadow);
        background-image: linear-gradient(135deg, var(--stat-card-from), var(--stat-card-to));
      }

      a.stat-card {
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      a.stat-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 14px 28px -10px var(--stat-card-shadow);
      }

      a.stat-card:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 3px;
      }

      .stat-card-label {
        font-size: 0.875rem;
        font-weight: 600;
        line-height: 1.3;
        color: rgba(255, 255, 255, 0.9);
      }

      /* Subtly styled, never a hard white glyph competing with the figure. */
      .stat-card-icon {
        flex: 0 0 auto;
        font-size: 1.35rem;
        color: rgba(255, 255, 255, 0.75);
      }

      .stat-card-body {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .stat-card-value {
        font-size: 2rem;
        font-weight: 700;
        line-height: 1.1;
        letter-spacing: -0.02em;
      }

      .stat-card-caption {
        font-size: 0.8rem;
        color: rgba(255, 255, 255, 0.75);
      }

      :host ::ng-deep .stat-card-skeleton {
        background: rgba(255, 255, 255, 0.25) !important;
      }

      /* Accents — the four brand constants of §12.2. */
      .stat-card-green {
        --stat-card-from: #10b981;
        --stat-card-to: #059669;
        --stat-card-shadow: rgba(16, 185, 129, 0.45);
      }

      .stat-card-slate {
        --stat-card-from: #94a3b8;
        --stat-card-to: #7c8da3;
        --stat-card-shadow: rgba(100, 116, 139, 0.4);
      }

      .stat-card-navy {
        --stat-card-from: #3f4b5f;
        --stat-card-to: #2c3543;
        --stat-card-shadow: rgba(44, 53, 67, 0.4);
      }

      .stat-card-amber {
        --stat-card-from: #f9a94c;
        --stat-card-to: #f08c25;
        --stat-card-shadow: rgba(240, 140, 37, 0.42);
      }

      @media (max-width: 575px) {
        .stat-card-value {
          font-size: 1.75rem;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input<string | number>('');
  readonly icon = input.required<string>();
  readonly accent = input.required<StatCardAccent>();
  readonly caption = input<string>('');
  /** When set the card navigates and gains the hover lift. */
  readonly link = input<string>('');
  readonly loading = input(false);

  protected readonly accentClass = computed(() => `stat-card-${this.accent()}`);
}
