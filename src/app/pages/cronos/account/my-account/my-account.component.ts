import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';

import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';

import { UserService } from 'src/app/core/services/user.service';
import { TokenService } from 'src/app/core/services/token.service';
import { UserResponse } from 'src/app/core/models/user.model';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { DetailSkeletonComponent } from 'src/app/shared/components/detail-skeleton/detail-skeleton.component';

@Component({
  selector: 'app-my-account',
  standalone: true,
  imports: [
    TranslatePipe,
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    DividerModule,
    InputTextModule,
    TagModule,
    DetailSkeletonComponent,
  ],
  templateUrl: './my-account.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyAccountComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly tokenService = inject(TokenService);
  private readonly toastService = inject(ToastService);
  private readonly language = inject(LanguageService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly fb = inject(FormBuilder);

  readonly user = signal<UserResponse | null>(null);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);

  readonly form = this.fb.group({
    firstName: [''],
    lastName: [''],
    phoneNumber: [''],
    username: [''],
  });

  ngOnInit(): void {
    this.pageInfoService.updateTitle(this.language.t('NAV.ITEMS.MY_ACCOUNT'));
    this.pageInfoService.updateDescription(this.language.t('ACCOUNT.MY_ACCOUNT_DESCRIPTION'));
    this.pageInfoService.updateBreadcrumbs([
      { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
      { title: this.language.t('NAV.SECTIONS.ACCOUNT'), path: '', isActive: false },
      { title: this.language.t('NAV.ITEMS.MY_ACCOUNT'), path: '', isActive: true },
    ]);
    this.loadProfile();
  }

  loadProfile(): void {
    this.isLoading.set(true);
    this.userService.getProfile().subscribe({
      next: (res) => {
        this.user.set(res.data);
        this.form.patchValue({
          firstName: res.data.firstName ?? '',
          lastName: res.data.lastName ?? '',
          phoneNumber: res.data.phoneNumber ?? '',
          username: res.data.username,
        });
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  save(): void {
    this.isSaving.set(true);
    this.userService
      .updateProfile({
        firstName: this.form.value.firstName || undefined,
        lastName: this.form.value.lastName || undefined,
        phoneNumber: this.form.value.phoneNumber || undefined,
        username: this.form.value.username || undefined,
      })
      .subscribe({
        next: (res) => {
          this.isSaving.set(false);
          this.user.set(res.data);
          this.tokenService.saveUserInfo(res.data.username, res.data.email);
          this.toastService.success(this.language.t('ACCOUNT.TOAST.PROFILE_UPDATED'));
        },
        error: (err) => {
          this.isSaving.set(false);
          this.toastService.error(this.language.t('COMMON.TOAST.ERROR'), err?.message);
        },
      });
  }
}
