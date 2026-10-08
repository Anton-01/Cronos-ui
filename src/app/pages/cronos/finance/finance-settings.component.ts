import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TabsModule } from 'primeng/tabs';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { map } from 'rxjs';

import { PERMISSIONS } from 'src/app/core/constants/permissions';
import { RoundingMode } from 'src/app/core/models/finance.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { FinanceDefaultsStore } from 'src/app/core/services/finance/finance-defaults.store';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { catalogErrorMessage, hasCatalogError } from 'src/app/core/utils/catalog-error.util';
import { AlertService } from 'src/app/shared/services/alert.service';
import { formatMoney } from 'src/app/shared/utils/money-format.util';
import { CurrencyCatalogComponent } from './currencies/currency-catalog.component';
import { TaxRateCatalogComponent } from './tax-rates/tax-rate-catalog.component';

type FinanceTab = 'overview' | 'currencies' | 'tax-rates';

const TABS: readonly { value: FinanceTab; labelKey: string; icon: string }[] = [
  { value: 'overview', labelKey: 'FINANCE.TABS.OVERVIEW', icon: 'pi pi-sliders-h' },
  { value: 'currencies', labelKey: 'FINANCE.TABS.CURRENCIES', icon: 'pi pi-dollar' },
  { value: 'tax-rates', labelKey: 'FINANCE.TABS.TAX_RATES', icon: 'pi pi-percentage' },
];

const ROUNDING_MODES: readonly RoundingMode[] = ['HALF_UP', 'HALF_EVEN', 'UP', 'DOWN'];
const EXAMPLE_NET = 1000;

/**
 * Finance configuration: the calculation defaults every document starts
 * from, plus the currency and IVA catalogs they are picked from (doc §9–§11).
 */
@Component({
  selector: 'app-finance-settings',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    TranslatePipe,
    ButtonModule,
    CardModule,
    MessageModule,
    SelectModule,
    SkeletonModule,
    TabsModule,
    ToggleSwitchModule,
    CurrencyCatalogComponent,
    TaxRateCatalogComponent,
  ],
  templateUrl: './finance-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinanceSettingsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authorization = inject(AuthorizationService);
  private readonly alert = inject(AlertService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);
  protected readonly store = inject(FinanceDefaultsStore);

  protected readonly tabs = TABS;
  protected readonly exampleNet = EXAMPLE_NET;
  private readonly tabParam = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('tab'))), {
    initialValue: this.route.snapshot.queryParamMap.get('tab'),
  });
  protected readonly activeTab = computed<FinanceTab>(() => TABS.find((tab) => tab.value === this.tabParam())?.value ?? 'overview');

  protected readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly saving = signal(false);
  protected readonly pricesIncludeTax = signal(false);
  protected readonly roundingMode = signal<RoundingMode>('HALF_UP');

  protected readonly canEdit = computed(() => this.authorization.can(PERMISSIONS.FINANCE_SETTINGS_UPDATE));
  protected readonly roundingOptions = computed(() =>
    ROUNDING_MODES.map((value) => ({ value, label: this.language.t(`FINANCE.ROUNDING.${value}`) })),
  );
  protected readonly isDirty = computed(() => {
    const settings = this.store.settings();
    return !!settings && (settings.pricesIncludeTax !== this.pricesIncludeTax() || settings.roundingMode !== this.roundingMode());
  });

  /** Worked example of how a 1,000 line is taxed with the current choices. */
  protected readonly example = computed(() => {
    const rate = this.store.defaultTaxPercent() / 100;
    const currency = this.store.defaultCurrency();
    const net = this.pricesIncludeTax() ? EXAMPLE_NET / (1 + rate) : EXAMPLE_NET;
    const tax = net * rate;
    const fmt = (value: number) => formatMoney(value, currency, this.language.current());
    return { net: fmt(net), tax: fmt(tax), total: fmt(net + tax), entered: fmt(EXAMPLE_NET) };
  });

  constructor() {
    effect(() => {
      this.pageInfo.updateTitle(this.language.t('FINANCE.TITLE'));
      this.pageInfo.updateDescription(this.language.t('FINANCE.DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('NAV.SECTIONS.SETTINGS'), path: '', isActive: false },
        { title: this.language.t('FINANCE.TITLE'), path: '', isActive: true },
      ]);
    });
    this.refresh();
  }

  protected refresh(): void {
    this.loadState.set('loading');
    this.store.refresh().subscribe({
      next: () => {
        this.syncPreferences();
        this.loadState.set('ready');
      },
      error: (error: unknown) => {
        this.loadState.set('error');
        this.alert.error(catalogErrorMessage(error, this.language.t('FINANCE.LOAD_FAILED')));
      },
    });
  }

  private syncPreferences(): void {
    const settings = this.store.settings();
    if (settings) {
      this.pricesIncludeTax.set(settings.pricesIncludeTax);
      this.roundingMode.set(settings.roundingMode);
    }
  }

  protected selectTab(value: string | number | undefined): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: value === 'overview' ? null : value },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected discard(): void {
    this.syncPreferences();
  }

  protected save(): void {
    const settings = this.store.settings();
    if (!settings || this.saving() || !this.canEdit()) {
      return;
    }
    this.saving.set(true);
    this.store
      .updateSettings({ pricesIncludeTax: this.pricesIncludeTax(), roundingMode: this.roundingMode(), version: settings.version })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.alert.success(this.language.t('FINANCE.SAVED'));
        },
        error: (error: unknown) => {
          this.saving.set(false);
          if (hasCatalogError(error, 'CONCURRENT_MODIFICATION')) {
            this.alert.warning(this.language.t('IAM.COMMON.CONCURRENT_MODIFICATION'));
            this.refresh();
            return;
          }
          this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED')));
        },
      });
  }

  /** A catalog changed a default: refresh the app-wide store so open forms pick it up. */
  protected onDefaultsChanged(): void {
    this.store.refresh().subscribe({ next: () => this.syncPreferences(), error: () => undefined });
  }
}
