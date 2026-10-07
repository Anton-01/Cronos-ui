import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { RecipeShareAccessLogResponse, RecipeShareResponse } from 'src/app/core/models/domain.model';
import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { apiErrorMessage } from 'src/app/core/utils/api-error.util';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { copyToClipboard } from 'src/app/shared/utils/clipboard.util';

/** Public share links for a recipe: create with expiry, copy, see who opened it, revoke. */
@Component({
  selector: 'app-recipe-shares-panel',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    TableModule,
    TagModule,
    TooltipModule,
    FieldErrorComponent,
    TableSkeletonRowComponent,
  ],
  templateUrl: './recipe-shares-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipeSharesPanelComponent implements OnInit {
  private readonly recipeService = inject(RecipeService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  readonly recipeId = input.required<string>();

  protected readonly shares = signal<RecipeShareResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly creating = signal(false);
  protected readonly analyticsFor = signal<RecipeShareResponse | null>(null);
  protected readonly analytics = signal<RecipeShareAccessLogResponse[]>([]);
  protected readonly analyticsLoading = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    expirationDays: [7, [Validators.required, Validators.min(1), Validators.max(30)]],
    recipientEmail: ['', [Validators.email, Validators.maxLength(254)]],
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.recipeService.getShares(this.recipeId()).subscribe({
      next: (response) => {
        this.shares.set(response.data ?? []);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.alert.error(apiErrorMessage(error, this.language.t('RECIPES.DETAIL.TOAST.SHARES_LOAD_FAILED')));
      },
    });
  }

  protected create(): void {
    if (this.form.invalid || this.creating()) {
      this.form.markAllAsTouched();
      return;
    }
    const { expirationDays, recipientEmail } = this.form.getRawValue();
    this.creating.set(true);
    this.recipeService.createShare(this.recipeId(), { expirationDays, recipientEmail: recipientEmail.trim() || undefined }).subscribe({
      next: (response) => {
        this.creating.set(false);
        this.form.reset({ expirationDays: 7, recipientEmail: '' });
        this.alert.success(this.language.t('RECIPES.DETAIL.TOAST.SHARE_CREATED'));
        if (response.data?.shareUrl) {
          void copyToClipboard(response.data.shareUrl);
        }
        this.load();
      },
      error: (error: unknown) => {
        this.creating.set(false);
        this.alert.error(apiErrorMessage(error, this.language.t('RECIPES.DETAIL.TOAST.SHARE_CREATE_FAILED')));
      },
    });
  }

  protected async copy(share: RecipeShareResponse): Promise<void> {
    if (await copyToClipboard(share.shareUrl)) {
      this.alert.success(this.language.t('RECIPES.DETAIL.TOAST.SHARE_COPIED'));
    }
  }

  protected async revoke(share: RecipeShareResponse): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: this.language.t('RECIPES.DETAIL.CONFIRM.REVOKE_TITLE'),
      message: this.language.t('RECIPES.DETAIL.CONFIRM.REVOKE_MESSAGE'),
      acceptLabel: this.language.t('RECIPES.DETAIL.CONFIRM.REVOKE_ACCEPT'),
      severity: 'danger',
      icon: 'pi pi-ban',
    });
    if (!confirmed) {
      return;
    }
    this.recipeService.revokeShare(this.recipeId(), share.id).subscribe({
      next: () => {
        this.alert.success(this.language.t('RECIPES.DETAIL.TOAST.SHARE_REVOKED'));
        this.load();
      },
      error: (error: unknown) => this.alert.error(apiErrorMessage(error, this.language.t('RECIPES.DETAIL.TOAST.SHARE_REVOKE_FAILED'))),
    });
  }

  protected openAnalytics(share: RecipeShareResponse): void {
    this.analyticsFor.set(share);
    this.analytics.set([]);
    this.analyticsLoading.set(true);
    this.recipeService.getShareAnalytics(this.recipeId(), share.id).subscribe({
      next: (response) => {
        this.analytics.set(response.data ?? []);
        this.analyticsLoading.set(false);
      },
      error: (error: unknown) => {
        this.analyticsLoading.set(false);
        this.alert.error(apiErrorMessage(error, this.language.t('RECIPES.DETAIL.TOAST.ANALYTICS_FAILED')));
      },
    });
  }

  protected isExpired(share: RecipeShareResponse): boolean {
    return new Date(share.expiresAt).getTime() < Date.now();
  }
}
