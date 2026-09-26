import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Signal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { TranslatePipe } from '@ngx-translate/core';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { HasUnsavedChanges } from 'src/app/core/guards/unsaved-changes.guard';
import { MEXICAN_STATES, TAX_REGIMES } from 'src/app/core/constants/sat-catalogs';
import {
  AccountSettingsTab,
  CroppedAvatar,
  FiscalDataResponse,
  MexicanStateCode,
  TaxRegimeCode,
  TaxpayerType,
  UpdateFiscalDataRequest,
  UpdateProfileRequest,
  UserResponse,
  isAccountSettingsTab,
} from 'src/app/core/models';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { apiErrorMessage, apiRootMessage } from 'src/app/core/utils/api-error.util';
import { AvatarCropperDialogComponent } from 'src/app/shared/components/avatar-cropper-dialog/avatar-cropper-dialog.component';
import { DetailSkeletonComponent } from 'src/app/shared/components/detail-skeleton/detail-skeleton.component';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { PhoneInputComponent } from 'src/app/shared/components/phone-input/phone-input.component';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { applyServerErrors } from 'src/app/shared/utils/form-server-errors';
import {
  legalNameValidator,
  mexicanZipCodeValidator,
  rfcValidator,
  taxRegimeMatchesRfcValidator,
  taxpayerTypeOf,
} from 'src/app/shared/validators/fiscal.validators';

import { AccountSettingsStore } from './account-settings.store';
import { SecurityPanelComponent } from './security-panel/security-panel.component';

interface TabDefinition {
  value: AccountSettingsTab;
  labelKey: string;
  icon: string;
}

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** `dirty`/`valid` of a form as a signal, so templates and `computed`s can react to it. */
interface FormSnapshot {
  dirty: boolean;
  valid: boolean;
}

const TABS: readonly TabDefinition[] = [
  { value: 'profile', labelKey: 'ACCOUNT.SETTINGS.TABS.PROFILE', icon: 'pi pi-user' },
  { value: 'security', labelKey: 'ACCOUNT.SETTINGS.TABS.SECURITY', icon: 'pi pi-shield' },
  { value: 'fiscal', labelKey: 'ACCOUNT.SETTINGS.TABS.FISCAL', icon: 'pi pi-building-columns' },
];

const DEFAULT_TAB: AccountSettingsTab = 'profile';

/**
 * Account Settings — one page, three lazily-rendered tabs.
 *
 * - **URL is the tab state.** `?tab=` drives the active tab, so the topbar's
 *   "Security" link, the old `/mi-cuenta` and `/seguridad` redirects, a
 *   refresh and the back button all land on the right tab.
 * - **Granular reactivity.** Each section's loading/saving flag lives in its
 *   own `AccountSettingsStore` slice. Saving fiscal data only touches
 *   `fiscal.saving`; the profile form never re-renders.
 * - **Lazy data.** Profile loads on entry; Security and Fiscal fetch the first
 *   time their tab opens and stay mounted afterwards (`p-tabs [lazy]`).
 */
@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [
    TranslatePipe,
    ReactiveFormsModule,
    AvatarModule,
    ButtonModule,
    CardModule,
    DividerModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TabsModule,
    TagModule,
    TooltipModule,
    AvatarCropperDialogComponent,
    DetailSkeletonComponent,
    FieldErrorComponent,
    PhoneInputComponent,
    SecurityPanelComponent,
  ],
  templateUrl: './account-settings.component.html',
  styleUrl: './account-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AccountSettingsStore],
})
export class AccountSettingsComponent implements HasUnsavedChanges {
  protected readonly store = inject(AccountSettingsStore);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);
  private readonly toast = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tabs = TABS;

  // ─── Tab state (URL-driven) ───

  private readonly tabParam = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('tab'))), {
    initialValue: this.route.snapshot.queryParamMap.get('tab'),
  });

  readonly activeTab = computed<AccountSettingsTab>(() => {
    const tab = this.tabParam();
    return isAccountSettingsTab(tab) ? tab : DEFAULT_TAB;
  });

  // ─── Avatar cropper ───

  readonly cropperVisible = signal(false);

  // ─── Profile form ───

  readonly profileForm = this.fb.group({
    username: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(50),
    ]),
    firstName: this.fb.nonNullable.control('', [Validators.maxLength(100)]),
    lastName: this.fb.nonNullable.control('', [Validators.maxLength(100)]),
    /** E.164 or null; format validation is contributed by `app-phone-input` (NG_VALIDATORS). */
    phoneNumber: this.fb.control<string | null>(null),
  });

  protected readonly profileState = this.trackForm(this.profileForm);

  // ─── Fiscal form (shape mirrors UpdateFiscalDataRequest) ───

  readonly fiscalForm = this.fb.group(
    {
      legalName: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.maxLength(254),
        legalNameValidator(),
      ]),
      taxId: this.fb.nonNullable.control('', [Validators.required, rfcValidator()]),
      taxRegime: this.fb.control<TaxRegimeCode | null>(null, [Validators.required]),
      address: this.fb.group({
        street: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(150)]),
        exteriorNumber: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(20)]),
        interiorNumber: this.fb.nonNullable.control('', [Validators.maxLength(20)]),
        neighborhood: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(100)]),
        municipality: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(100)]),
        state: this.fb.control<MexicanStateCode | null>(null, [Validators.required]),
        zipCode: this.fb.nonNullable.control('', [Validators.required, mexicanZipCodeValidator()]),
      }),
    },
    { validators: taxRegimeMatchesRfcValidator('taxId', 'taxRegime') },
  );

  protected readonly fiscalState = this.trackForm(this.fiscalForm);

  private readonly taxIdValue = toSignal(this.fiscalForm.controls.taxId.valueChanges, { initialValue: '' });

  /** Derived from the RFC as the user types — drives the regime list and the badge. */
  readonly taxpayerType = computed<TaxpayerType | null>(() => taxpayerTypeOf(this.taxIdValue()));

  /** Regimes SAT allows for the RFC's taxpayer type (all of them until the RFC is valid). */
  readonly taxRegimeOptions = computed<SelectOption<TaxRegimeCode>[]>(() => {
    const type = this.taxpayerType();
    return TAX_REGIMES.filter((regime) => type === null || regime.appliesTo.includes(type)).map((regime) => ({
      value: regime.code,
      label: `${regime.code} · ${this.language.t(`ACCOUNT.FISCAL.REGIMES.${regime.code}`)}`,
    }));
  });

  protected readonly stateOptions: SelectOption<MexicanStateCode>[] = MEXICAN_STATES.map((state) => ({
    value: state.code,
    label: state.name,
  }));

  // ─── Derived view state ───

  readonly hasUnsavedChanges = computed(() => this.profileState().dirty || this.fiscalState().dirty);

  /** Per-tab "unsaved changes" dot. */
  readonly dirtyTabs = computed<ReadonlySet<AccountSettingsTab>>(() => {
    const dirty = new Set<AccountSettingsTab>();
    if (this.profileState().dirty) {
      dirty.add('profile');
    }
    if (this.fiscalState().dirty) {
      dirty.add('fiscal');
    }
    return dirty;
  });

  constructor() {
    this.pageInfo.updateTitle(this.language.t('ACCOUNT.SETTINGS.TITLE'));
    this.pageInfo.updateDescription(this.language.t('ACCOUNT.SETTINGS.DESCRIPTION'));

    // Breadcrumb tail follows the active tab (and the language).
    effect(() => {
      const tab = TABS.find((definition) => definition.value === this.activeTab()) ?? TABS[0];
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('NAV.SECTIONS.ACCOUNT'), path: '', isActive: false },
        { title: this.language.t('ACCOUNT.SETTINGS.TITLE'), path: '', isActive: false },
        { title: this.language.t(tab.labelKey), path: '', isActive: true },
      ]);
    });

    // Fiscal data is fetched the first time its tab is opened, never before.
    effect(() => {
      if (this.activeTab() === 'fiscal' && untracked(() => this.store.fiscal().status) === 'idle') {
        untracked(() => this.loadFiscal());
      }
    });

    this.loadProfile();
    this.destroyRef.onDestroy(() => this.store.dispose());
  }

  // ─── Tabs ───

  selectTab(value: string | number | undefined): void {
    if (!isAccountSettingsTab(value) || value === this.activeTab()) {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: value === DEFAULT_TAB ? null : value },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // ─── Profile ───

  loadProfile(): void {
    this.store
      .loadProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => this.resetProfileForm(user),
        error: (err: unknown) =>
          this.toast.error(this.language.t('COMMON.TOAST.ERROR'), apiErrorMessage(err, this.language.t('COMMON.TRY_AGAIN'))),
      });
  }

  saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    const value = this.profileForm.getRawValue();
    const request: UpdateProfileRequest = {
      username: value.username.trim(),
      firstName: value.firstName.trim() || null,
      lastName: value.lastName.trim() || null,
      phoneNumber: value.phoneNumber,
    };

    this.profileForm.disable({ emitEvent: false });
    this.store
      .saveProfile(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.profileForm.enable({ emitEvent: false });
          this.resetProfileForm(user);
          this.toast.success(this.language.t('ACCOUNT.TOAST.PROFILE_UPDATED'));
        },
        error: (err: unknown) => {
          this.profileForm.enable({ emitEvent: false });
          this.reportSaveError(this.profileForm, err);
        },
      });
  }

  discardProfile(): void {
    const user = this.store.user();
    if (user) {
      this.resetProfileForm(user);
    }
  }

  private resetProfileForm(user: UserResponse): void {
    this.profileForm.reset({
      username: user.username,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      phoneNumber: user.phoneNumber,
    });
  }

  // ─── Avatar ───

  openCropper(): void {
    this.cropperVisible.set(true);
  }

  onAvatarCropped(avatar: CroppedAvatar): void {
    this.store
      .uploadAvatar(avatar.file, avatar.previewUrl)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cropperVisible.set(false);
          this.toast.success(this.language.t('ACCOUNT.TOAST.AVATAR_UPDATED'));
        },
        // Dialog stays open with the crop intact so the user can retry.
        error: (err: unknown) =>
          this.toast.error(this.language.t('ACCOUNT.TOAST.AVATAR_FAILED'), apiErrorMessage(err, this.language.t('COMMON.TRY_AGAIN'))),
      });
  }

  async confirmRemoveAvatar(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: this.language.t('ACCOUNT.AVATAR.REMOVE_TITLE'),
      message: this.language.t('ACCOUNT.AVATAR.REMOVE_MESSAGE'),
      acceptLabel: this.language.t('ACCOUNT.AVATAR.REMOVE_ACCEPT'),
      severity: 'danger',
      icon: 'pi pi-trash',
    });
    if (!confirmed) {
      return;
    }
    this.store
      .removeAvatar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toast.success(this.language.t('ACCOUNT.TOAST.AVATAR_REMOVED')),
        error: (err: unknown) =>
          this.toast.error(this.language.t('COMMON.TOAST.ERROR'), apiErrorMessage(err, this.language.t('COMMON.TRY_AGAIN'))),
      });
  }

  /** The server image finished loading — the optimistic blob preview can go. */
  onAvatarImageLoaded(): void {
    this.store.releaseAvatarPreview();
  }

  // ─── Fiscal data ───

  loadFiscal(): void {
    this.store
      .loadFiscal()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.resetFiscalForm(data),
        error: (err: unknown) =>
          this.toast.error(this.language.t('COMMON.TOAST.ERROR'), apiErrorMessage(err, this.language.t('COMMON.TRY_AGAIN'))),
      });
  }

  saveFiscal(): void {
    if (this.fiscalForm.invalid) {
      this.fiscalForm.markAllAsTouched();
      return;
    }
    const request = this.buildFiscalRequest();
    if (!request) {
      return;
    }

    this.fiscalForm.disable({ emitEvent: false });
    this.store
      .saveFiscal(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.fiscalForm.enable({ emitEvent: false });
          this.resetFiscalForm(data);
          this.toast.success(this.language.t('ACCOUNT.TOAST.FISCAL_UPDATED'));
        },
        error: (err: unknown) => {
          this.fiscalForm.enable({ emitEvent: false });
          this.reportSaveError(this.fiscalForm, err);
        },
      });
  }

  discardFiscal(): void {
    this.resetFiscalForm(this.store.fiscal().data);
  }

  private buildFiscalRequest(): UpdateFiscalDataRequest | null {
    const value = this.fiscalForm.getRawValue();
    const { taxRegime } = value;
    const { state } = value.address;
    // Both are guaranteed by Validators.required; the guard narrows the types.
    if (!taxRegime || !state) {
      return null;
    }
    return {
      legalName: value.legalName.trim().toUpperCase(),
      taxId: value.taxId.trim().toUpperCase(),
      taxRegime,
      address: {
        street: value.address.street.trim(),
        exteriorNumber: value.address.exteriorNumber.trim(),
        interiorNumber: value.address.interiorNumber.trim() || null,
        neighborhood: value.address.neighborhood.trim(),
        municipality: value.address.municipality.trim(),
        state,
        zipCode: value.address.zipCode.trim(),
        country: 'MEX',
      },
    };
  }

  private resetFiscalForm(data: FiscalDataResponse | null): void {
    this.fiscalForm.reset({
      legalName: data?.legalName ?? '',
      taxId: data?.taxId ?? '',
      taxRegime: data?.taxRegime ?? null,
      address: {
        street: data?.address.street ?? '',
        exteriorNumber: data?.address.exteriorNumber ?? '',
        interiorNumber: data?.address.interiorNumber ?? '',
        neighborhood: data?.address.neighborhood ?? '',
        municipality: data?.address.municipality ?? '',
        state: data?.address.state ?? null,
        zipCode: data?.address.zipCode ?? '',
      },
    });
  }

  // ─── Leave guard ───

  /** Used by the route's `canDeactivate`: confirm before discarding unsaved edits. */
  async canDeactivate(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) {
      return true;
    }
    return this.confirmService.confirm({
      title: this.language.t('ACCOUNT.SETTINGS.UNSAVED_TITLE'),
      message: this.language.t('ACCOUNT.SETTINGS.UNSAVED_MESSAGE'),
      acceptLabel: this.language.t('ACCOUNT.SETTINGS.UNSAVED_ACCEPT'),
      severity: 'danger',
    });
  }

  // ─── Template helpers ───

  /** Show a control's error once the user has interacted with it. */
  showError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  formatDate(value: string | null): string {
    if (!value) {
      return this.language.t('COMMON.EMPTY_VALUE_DASH');
    }
    return new Date(value).toLocaleDateString(this.language.current(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  // ─── Internals ───

  /**
   * Field-scoped failures land under their controls with a summary toast;
   * anything else surfaces the API message.
   */
  private reportSaveError(form: AbstractControl, err: unknown): void {
    const fallback = this.language.t('COMMON.TOAST.SAVE_FAILED');
    if (applyServerErrors(form, err)) {
      this.toast.error(apiRootMessage(err, fallback));
      return;
    }
    this.toast.error(fallback, apiErrorMessage(err, this.language.t('COMMON.TRY_AGAIN')));
  }

  private trackForm(form: AbstractControl): Signal<FormSnapshot> {
    const snapshot = (): FormSnapshot => ({ dirty: form.dirty, valid: form.valid });
    return toSignal(form.events.pipe(map(snapshot)), { initialValue: snapshot() });
  }
}
