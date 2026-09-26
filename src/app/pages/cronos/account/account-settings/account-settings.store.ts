import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, map, tap } from 'rxjs';

import {
  AvatarResponse,
  FiscalDataResponse,
  SectionState,
  UpdateFiscalDataRequest,
  UpdateProfileRequest,
  UserResponse,
  initialSectionState,
} from 'src/app/core/models';
import { AccountService } from 'src/app/core/services/account.service';
import { ProfileStateService } from 'src/app/core/services/profile/ProfileStateService';
import { TokenService } from 'src/app/core/services/token.service';

/**
 * Component-scoped state for Account Settings.
 *
 * One `SectionState` slice per tab. Every mutation touches exactly one slice,
 * so saving fiscal data flips `fiscal.saving` and nothing else — the profile
 * form, the avatar and the security tab never see a change notification.
 *
 * Writes return the Observable so the caller owns UI feedback (toasts, inline
 * server errors) while the store owns state transitions.
 */
@Injectable()
export class AccountSettingsStore {
  private readonly accountService = inject(AccountService);
  private readonly profileState = inject(ProfileStateService);
  private readonly tokenService = inject(TokenService);

  private readonly profileSlice = signal<SectionState<UserResponse>>(initialSectionState());
  private readonly fiscalSlice = signal<SectionState<FiscalDataResponse>>(initialSectionState());
  /** Avatar has no load of its own (it rides on the profile) — only an upload flag. */
  private readonly avatarUploading = signal(false);
  /** Local `blob:` preview shown while the upload is in flight and until the server URL loads. */
  private readonly avatarPreview = signal<string | null>(null);

  // ─── Read-only selectors ───

  readonly profile = this.profileSlice.asReadonly();
  readonly fiscal = this.fiscalSlice.asReadonly();
  readonly isUploadingAvatar = this.avatarUploading.asReadonly();

  readonly user = computed(() => this.profileSlice().data);
  readonly avatarUrl = computed(() => this.avatarPreview() ?? this.user()?.avatarUrl ?? null);
  readonly initials = computed(() => {
    const user = this.user();
    if (!user) {
      return '';
    }
    const first = user.firstName?.charAt(0) ?? user.username.charAt(0);
    const last = user.lastName?.charAt(0) ?? '';
    return (first + last).toUpperCase();
  });
  readonly displayName = computed(() => {
    const user = this.user();
    return user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username : '';
  });

  // ─── Profile ───

  loadProfile(): Observable<UserResponse> {
    this.profileSlice.update((state) => ({ ...state, status: 'loading' }));
    return this.accountService.getProfile().pipe(
      map((res) => res.data),
      tap({
        next: (user) => this.profileSlice.set({ data: user, status: 'ready', saving: false }),
        error: () => this.profileSlice.update((state) => ({ ...state, status: 'error' })),
      }),
    );
  }

  saveProfile(request: UpdateProfileRequest): Observable<UserResponse> {
    this.profileSlice.update((state) => ({ ...state, saving: true }));
    return this.accountService.updateProfile(request).pipe(
      map((res) => res.data),
      tap((user) => {
        this.profileSlice.update((state) => ({ ...state, data: user }));
        this.syncShell(user);
        this.tokenService.saveUserInfo(user.username, user.email);
      }),
      finalize(() => this.profileSlice.update((state) => ({ ...state, saving: false }))),
    );
  }

  // ─── Avatar ───

  /**
   * Optimistic: the cropped preview shows immediately and is rolled back if
   * the upload fails. `previewUrl` ownership passes to the store.
   */
  uploadAvatar(file: File, previewUrl: string): Observable<AvatarResponse> {
    this.setAvatarPreview(previewUrl);
    this.avatarUploading.set(true);
    return this.accountService.uploadAvatar(file).pipe(
      map((res) => res.data),
      tap({
        next: (avatar) => this.applyAvatarUrl(avatar.avatarUrl),
        error: () => this.setAvatarPreview(null),
      }),
      finalize(() => this.avatarUploading.set(false)),
    );
  }

  removeAvatar(): Observable<void> {
    this.avatarUploading.set(true);
    return this.accountService.deleteAvatar().pipe(
      map(() => undefined),
      tap(() => {
        this.setAvatarPreview(null);
        this.applyAvatarUrl(null);
      }),
      finalize(() => this.avatarUploading.set(false)),
    );
  }

  /** Drop the local preview once the server image has rendered. */
  releaseAvatarPreview(): void {
    if (this.avatarPreview() && this.user()?.avatarUrl) {
      this.setAvatarPreview(null);
    }
  }

  // ─── Fiscal data ───

  loadFiscal(): Observable<FiscalDataResponse | null> {
    this.fiscalSlice.update((state) => ({ ...state, status: 'loading' }));
    return this.accountService.getFiscalData().pipe(
      map((res) => res.data),
      tap({
        next: (data) => this.fiscalSlice.set({ data, status: 'ready', saving: false }),
        error: () => this.fiscalSlice.update((state) => ({ ...state, status: 'error' })),
      }),
    );
  }

  saveFiscal(request: UpdateFiscalDataRequest): Observable<FiscalDataResponse> {
    this.fiscalSlice.update((state) => ({ ...state, saving: true }));
    return this.accountService.updateFiscalData(request).pipe(
      map((res) => res.data),
      tap((data) => this.fiscalSlice.update((state) => ({ ...state, data }))),
      finalize(() => this.fiscalSlice.update((state) => ({ ...state, saving: false }))),
    );
  }

  /** Revoke any object URL still held — call from the host's destroy hook. */
  dispose(): void {
    this.setAvatarPreview(null);
  }

  // ─── Internals ───

  private applyAvatarUrl(avatarUrl: string | null): void {
    const current = this.user();
    if (!current) {
      return;
    }
    const next: UserResponse = { ...current, avatarUrl };
    this.profileSlice.update((state) => ({ ...state, data: next }));
    this.syncShell(next);
  }

  /** Keep the topbar avatar/name (root `ProfileStateService`) in step without refetching. */
  private syncShell(user: UserResponse): void {
    this.profileState.updateUserSignal(user);
  }

  private setAvatarPreview(url: string | null): void {
    const previous = this.avatarPreview();
    if (previous && previous !== url) {
      URL.revokeObjectURL(previous);
    }
    this.avatarPreview.set(url);
  }
}
