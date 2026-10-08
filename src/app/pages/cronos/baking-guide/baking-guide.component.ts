import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TabsModule } from 'primeng/tabs';
import { map } from 'rxjs';

import { BakingGuide, GuideCategory } from 'src/app/core/models/baking-guide.models';
import { BakingGuideService } from 'src/app/core/services/domain/baking-guide.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { GuideArticlesComponent } from './guide-articles.component';
import { GuideCalculatorsComponent } from './guide-calculators.component';
import { GuidePansComponent } from './guide-pans.component';

type GuideTab = 'calculators' | 'pans' | 'safety' | 'techniques' | 'costing';

const TABS: readonly { value: GuideTab; labelKey: string; icon: string; category?: GuideCategory }[] = [
  { value: 'calculators', labelKey: 'GUIDE.TABS.CALCULATORS', icon: 'pi pi-calculator' },
  { value: 'pans', labelKey: 'GUIDE.TABS.PANS', icon: 'pi pi-stop-circle' },
  { value: 'safety', labelKey: 'GUIDE.TABS.SAFETY', icon: 'pi pi-shield', category: 'FOOD_SAFETY' },
  { value: 'techniques', labelKey: 'GUIDE.TABS.TECHNIQUES', icon: 'pi pi-book', category: 'TECHNIQUES' },
  { value: 'costing', labelKey: 'GUIDE.TABS.COSTING', icon: 'pi pi-wallet', category: 'COSTING' },
];

/**
 * Baker's reference: calculators (price & margin, pan conversion,
 * temperatures, volume ↔ weight), pan sizes with capacity and servings, and
 * articles on food safety, techniques and costing rules. Content comes from
 * `/baking-guide`; until the API ships, the bundled seed is shown read-only.
 */
@Component({
  selector: 'app-baking-guide',
  standalone: true,
  imports: [TranslatePipe, ButtonModule, CardModule, MessageModule, SkeletonModule, TabsModule, GuideArticlesComponent, GuideCalculatorsComponent, GuidePansComponent],
  templateUrl: './baking-guide.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BakingGuideComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(BakingGuideService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);

  protected readonly tabs = TABS;
  protected readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly guide = signal<BakingGuide | null>(null);
  protected readonly offline = signal(false);

  private readonly tabParam = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('tab'))), {
    initialValue: this.route.snapshot.queryParamMap.get('tab'),
  });
  protected readonly activeTab = computed<GuideTab>(() => TABS.find((tab) => tab.value === this.tabParam())?.value ?? 'calculators');

  protected readonly articlesBy = computed(() => {
    const byCategory = new Map<GuideCategory, BakingGuide['articles']>();
    for (const article of (this.guide()?.articles ?? []).slice().sort((a, b) => a.displayOrder - b.displayOrder)) {
      byCategory.set(article.category, [...(byCategory.get(article.category) ?? []), article]);
    }
    return byCategory;
  });

  constructor() {
    effect(() => {
      this.pageInfo.updateTitle(this.language.t('GUIDE.TITLE'));
      this.pageInfo.updateDescription(this.language.t('GUIDE.DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('GUIDE.TITLE'), path: '', isActive: true },
      ]);
    });
    this.load();
  }

  protected load(refresh = false): void {
    if (refresh) {
      this.service.invalidate();
    } else {
      this.loadState.set('loading');
    }
    this.service.load().subscribe({
      next: ({ guide, offline }) => {
        this.guide.set(guide);
        this.offline.set(offline);
        this.loadState.set('ready');
      },
      error: () => this.loadState.set('error'),
    });
  }

  protected selectTab(value: string | number | undefined): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: value }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
