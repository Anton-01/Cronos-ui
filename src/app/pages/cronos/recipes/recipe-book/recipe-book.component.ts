import { DecimalPipe, LowerCasePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { PopoverModule } from 'primeng/popover';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { map } from 'rxjs';

import { PERMISSIONS } from 'src/app/core/constants/permissions';
import { RecipeDetail } from 'src/app/core/models/kitchen.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AllergenBadgesComponent } from '../../kitchen-shared/allergen-badges.component';
import { formatMinutes } from '../../kitchen-shared/kitchen-labels';
import { BookPage, buildBook, scaleQuantity } from './book-pages';

const SCALE_PRESETS: readonly number[] = [0.5, 1, 1.5, 2, 3];
const TYPE_SIZES = ['sm', 'md', 'lg'] as const;
type TypeSize = (typeof TYPE_SIZES)[number];
const SPREAD_QUERY = '(min-width: 1100px)';
const TYPE_SIZE_KEY = 'cronos.recipeBook.typeSize';

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

/**
 * Read-only "cookbook" view of a recipe for the kitchen: cover, ingredients
 * (scaled to the batch being made, with a mise-en-place checklist), the
 * process split into numbered steps, and storage notes — laid out as a
 * two-page spread on wide screens and one page on phones. Arrow keys and
 * swipes turn pages; the screen can be kept awake; prints every page.
 *
 * Opened full-screen (outside the app shell) from the recipe cards and the
 * studio. `?scale=1.5` opens it already scaled (used by the pan calculator).
 */
@Component({
  selector: 'app-recipe-book',
  standalone: true,
  imports: [
    DecimalPipe,
    LowerCasePipe,
    NgTemplateOutlet,
    FormsModule,
    RouterLink,
    TranslatePipe,
    ButtonModule,
    InputNumberModule,
    MessageModule,
    PopoverModule,
    SelectButtonModule,
    SkeletonModule,
    TooltipModule,
    AllergenBadgesComponent,
  ],
  templateUrl: './recipe-book.component.html',
  styleUrls: ['./recipe-book.component.scss', './recipe-book-pages.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipeBookComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly recipeService = inject(RecipeService);
  private readonly authorization = inject(AuthorizationService);
  private readonly alert = inject(AlertService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);

  protected readonly recipeId = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly recipe = signal<RecipeDetail | null>(null);
  protected readonly canEdit = computed(() => this.authorization.can(PERMISSIONS.RECIPE_UPDATE));

  // ─── Scale ───
  private readonly scaleParam = toSignal(this.route.queryParamMap.pipe(map((params) => Number(params.get('scale')))), {
    initialValue: Number(this.route.snapshot.queryParamMap.get('scale')),
  });
  protected readonly scale = signal(1);
  protected readonly scaleOptions = computed(() => SCALE_PRESETS.map((value) => ({ label: `×${value}`, value })));
  protected readonly targetYield = computed(() => {
    const recipe = this.recipe();
    return recipe ? scaleQuantity(recipe.yieldQuantity, this.scale()) : null;
  });

  // ─── Pages ───
  protected readonly pages = computed<BookPage[]>(() => {
    const recipe = this.recipe();
    return recipe ? buildBook(recipe) : [];
  });
  private readonly wide = signal(typeof window !== 'undefined' && window.matchMedia(SPREAD_QUERY).matches);
  protected readonly perView = computed(() => (this.wide() ? 2 : 1));
  /** Index of the first page on screen (even on a spread). */
  protected readonly index = signal(0);
  protected readonly turn = signal<'next' | 'prev' | null>(null);
  protected readonly visible = computed(() => this.pages().slice(this.index(), this.index() + this.perView()).map((page, offset) => ({ page, number: this.index() + offset + 1 })));
  protected readonly canPrev = computed(() => this.index() > 0);
  protected readonly canNext = computed(() => this.index() + this.perView() < this.pages().length);
  protected readonly stepCount = computed(() => this.pages().reduce((total, page) => total + (page.kind === 'process' ? page.blocks.filter((block) => block.kind === 'step').length : 0), 0));
  protected readonly lineNotes = computed(() => (this.recipe()?.lines ?? []).filter((line) => !!line.notes?.trim()));

  // ─── Reading aids ───
  protected readonly checkedLines = signal<ReadonlySet<string>>(new Set());
  protected readonly doneSteps = signal<ReadonlySet<number>>(new Set());
  protected readonly typeSize = signal<TypeSize>(readTypeSize());
  protected readonly wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  protected readonly awake = signal(false);
  private wakeLock: WakeLockSentinelLike | null = null;
  private touchStartX: number | null = null;

  constructor() {
    const media = window.matchMedia(SPREAD_QUERY);
    const onMedia = (event: MediaQueryListEvent) => {
      this.wide.set(event.matches);
      this.index.update((value) => this.align(value));
    };
    media.addEventListener('change', onMedia);
    const onVisibility = () => {
      // The browser drops the lock when the tab is hidden; take it again on return.
      if (document.visibilityState === 'visible' && this.awake() && !this.wakeLock) {
        void this.requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      media.removeEventListener('change', onMedia);
      document.removeEventListener('visibilitychange', onVisibility);
      void this.wakeLock?.release();
    });

    effect(() => {
      const value = this.scaleParam();
      this.scale.set(Number.isFinite(value) && value > 0 && value <= 20 ? value : 1);
    });

    effect(() => {
      const name = this.recipe()?.name ?? this.language.t('KITCHEN.BOOK.TITLE');
      this.pageInfo.updateTitle(name);
    });

    this.load();
  }

  protected load(): void {
    this.loadState.set('loading');
    this.recipeService.getById(this.recipeId).subscribe({
      next: (response) => {
        this.recipe.set(response.data);
        this.loadState.set(response.data ? 'ready' : 'error');
      },
      error: (error: unknown) => {
        this.loadState.set('error');
        this.alert.error(catalogErrorMessage(error, this.language.t('KITCHEN.RECIPES.LOAD_FAILED')));
      },
    });
  }

  // ─── Navigation ───

  protected next(): void {
    if (this.canNext()) {
      this.turn.set('next');
      this.index.update((value) => value + this.perView());
    }
  }

  protected prev(): void {
    if (this.canPrev()) {
      this.turn.set('prev');
      this.index.update((value) => Math.max(0, value - this.perView()));
    }
  }

  protected goTo(pageIndex: number): void {
    const target = this.align(pageIndex);
    this.turn.set(target > this.index() ? 'next' : 'prev');
    this.index.set(target);
  }

  /** First page of the ingredients / process chapter, for the table of contents. */
  protected chapterStart(kind: BookPage['kind']): number {
    return this.pages().findIndex((page) => page.kind === kind);
  }

  private align(pageIndex: number): number {
    const clamped = Math.max(0, Math.min(pageIndex, this.pages().length - 1));
    return clamped - (clamped % this.perView());
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      this.next();
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      this.prev();
    } else if (event.key === 'Home') {
      this.goTo(0);
    } else if (event.key === 'End') {
      this.goTo(this.pages().length - 1);
    }
  }

  protected onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.touches[0]?.clientX ?? null;
  }

  protected onTouchEnd(event: TouchEvent): void {
    const start = this.touchStartX;
    const end = event.changedTouches[0]?.clientX;
    this.touchStartX = null;
    if (start === null || end === undefined || Math.abs(end - start) < 60) {
      return;
    }
    if (end < start) {
      this.next();
    } else {
      this.prev();
    }
  }

  // ─── Scale ───

  protected setScale(value: number | null): void {
    if (value && value > 0 && value <= 20) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { scale: value === 1 ? null : value }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  /** Scale from a target yield ("I want 30 servings"). */
  protected setTargetYield(value: number | null): void {
    const recipe = this.recipe();
    if (recipe && value && value > 0) {
      this.setScale(Math.round((value / recipe.yieldQuantity) * 1000) / 1000);
    }
  }

  protected quantity(value: number): number {
    return scaleQuantity(value, this.scale());
  }

  protected time(minutes: number | null): string {
    return formatMinutes(minutes ?? 0, (key) => this.language.t(key));
  }

  // ─── Checklists ───

  protected toggleLine(id: string): void {
    this.checkedLines.update((set) => toggle(set, id));
  }

  protected toggleStep(number: number): void {
    this.doneSteps.update((set) => toggle(set, number));
  }

  protected resetChecks(): void {
    this.checkedLines.set(new Set());
    this.doneSteps.set(new Set());
  }

  // ─── Type size, wake lock, print ───

  protected setTypeSize(size: TypeSize): void {
    this.typeSize.set(size);
    try {
      localStorage.setItem(TYPE_SIZE_KEY, size);
    } catch {
      // Storage unavailable (private mode): the size just isn't remembered.
    }
  }

  protected async toggleAwake(): Promise<void> {
    if (this.awake()) {
      this.awake.set(false);
      await this.wakeLock?.release();
      this.wakeLock = null;
      return;
    }
    this.awake.set(true);
    await this.requestWakeLock();
  }

  private async requestWakeLock(): Promise<void> {
    try {
      const wakeLock = (navigator as Navigator & { wakeLock: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
      this.wakeLock = await wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => (this.wakeLock = null));
    } catch {
      this.awake.set(false);
      this.alert.warning(this.language.t('KITCHEN.BOOK.AWAKE_FAILED'));
    }
  }

  protected print(): void {
    window.print();
  }
}

function toggle<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  if (!next.delete(value)) {
    next.add(value);
  }
  return next;
}

function readTypeSize(): TypeSize {
  try {
    const stored = localStorage.getItem(TYPE_SIZE_KEY);
    return (TYPE_SIZES as readonly string[]).includes(stored ?? '') ? (stored as TypeSize) : 'md';
  } catch {
    return 'md';
  }
}
