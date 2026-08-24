import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';

import { TranslatePipe } from '@ngx-translate/core';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TooltipModule } from 'primeng/tooltip';

import { UserService } from 'src/app/core/services/user.service';
import { RoleService } from 'src/app/core/services/role.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { UserResponse } from 'src/app/core/models/user.model';
import { RoleResponse } from 'src/app/core/models/role.model';

@Component({
  selector: 'app-create-user-modal',
  standalone: true,
  imports: [
    TranslatePipe,
    FormsModule,
    ReactiveFormsModule,
    AvatarModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    TooltipModule,
    ImageCropperComponent,
  ],
  templateUrl: './create-user-modal.component.html',
  styleUrl: './create-user-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateUserModalComponent implements OnInit, OnDestroy {
  private readonly userService = inject(UserService);
  private readonly roleService = inject(RoleService);
  private readonly toastService = inject(ToastService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  @Output() closed = new EventEmitter<void>();
  @Output() userCreated = new EventEmitter<UserResponse>();

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  // ─── Roles state ───
  readonly availableRoles = signal<RoleResponse[]>([]);
  /** Stores numeric role IDs — matches backend Set<Long> roleIds */
  readonly selectedRoleIds = signal<Set<number>>(new Set());
  readonly isLoadingRoles = signal(false);

  // ─── Image cropper state ───
  imageChangedEvent: Event | null = null;
  croppedBlob: Blob | null = null;
  croppedPreview: string | null = null;
  readonly hasCropperImage = signal(false);
  readonly imageLoadError = signal(false);

  readonly isSaving = signal(false);

  readonly form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email]],
    firstName: [''],
    lastName: [''],
    phoneNumber: [''],
  });

  /**
   * Bridge reactive-form status to a Signal so computed() can track it.
   * Without this, computed() would never re-evaluate when form validity changes.
   */
  private readonly formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });

  /** Save is allowed when: form valid + at least one role selected + not already saving */
  readonly canSubmit = computed(
    () => this.formStatus() === 'VALID' && this.selectedRoleIds().size > 0 && !this.isSaving()
  );

  ngOnInit(): void {
    this.loadRoles();
  }

  ngOnDestroy(): void {
    // Revoke any object URLs created during cropping
    if (this.croppedPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(this.croppedPreview);
    }
  }

  // ─── Roles ───

  loadRoles(): void {
    this.isLoadingRoles.set(true);
    this.roleService.getAll().subscribe({
      next: (res) => {
        this.availableRoles.set(res.data);
        this.isLoadingRoles.set(false);
      },
      error: () => {
        this.isLoadingRoles.set(false);
        this.toastService.error('Error', this.language.t('ADMIN.USERS.MODAL.ROLES_LOAD_FAILED'));
      },
    });
  }

  toggleRole(roleId: number): void {
    this.selectedRoleIds.update((set) => {
      const next = new Set(set);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  }

  isRoleSelected(roleId: number): boolean {
    return this.selectedRoleIds().has(roleId);
  }

  // ─── Image cropper ───

  triggerFileInput(): void {
    this.fileInputRef.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      return;
    }

    this.imageChangedEvent = event;
    this.hasCropperImage.set(true);
    this.imageLoadError.set(false);
    this.croppedBlob = null;
    this.croppedPreview = null;
  }

  onImageCropped(event: ImageCroppedEvent): void {
    this.croppedBlob = event.blob ?? null;
    // base64 data URL is safe to use in [src] without DomSanitizer
    this.croppedPreview = event.base64 ?? null;
  }

  onLoadImageFailed(): void {
    this.imageLoadError.set(true);
    this.hasCropperImage.set(false);
    this.imageChangedEvent = null;
    this.toastService.error(this.language.t('ADMIN.USERS.MODAL.INVALID_FORMAT'), this.language.t('ADMIN.USERS.MODAL.INVALID_FORMAT_DETAIL'));
  }

  removeImage(): void {
    this.imageChangedEvent = null;
    this.croppedBlob = null;
    this.croppedPreview = null;
    this.hasCropperImage.set(false);
    this.imageLoadError.set(false);
    if (this.fileInputRef) {
      this.fileInputRef.nativeElement.value = '';
    }
  }

  // ─── FormData helpers ───

  private buildFormData(): FormData {
    const formData = new FormData();

    const userData = {
      username: this.form.value.username!.trim(),
      email: this.form.value.email!.trim(),
      firstName: this.form.value.firstName?.trim() || null,
      lastName: this.form.value.lastName?.trim() || null,
      phoneNumber: this.form.value.phoneNumber?.trim() || null,
      roleIds: Array.from(this.selectedRoleIds()), // number[], matches Set<Long>
    };

    // Backend expects: @RequestPart("userData") — must be application/json Blob
    formData.append('userData', new Blob([JSON.stringify(userData)], { type: 'application/json' }));

    // Backend expects: @RequestPart("profilePicture") — optional
    if (this.croppedBlob) {
      formData.append('profilePicture', this.croppedBlob, 'avatar.jpg');
    }

    return formData;
  }

  // ─── Submit ───

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (!this.canSubmit()) {
      return;
    }

    this.isSaving.set(true);
    this.userService.registerUser(this.buildFormData()).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.toastService.success(this.language.t('ADMIN.USERS.TOAST.CREATED'), this.language.t('ADMIN.USERS.TOAST.CREATED_DETAIL', { username: res.data.username }));
        this.userCreated.emit(res.data);
        this.close();
      },
      error: (err) => {
        this.isSaving.set(false);
        this.toastService.error(this.language.t('ADMIN.USERS.TOAST.CREATE_FAILED'), err?.error?.message ?? this.language.t('COMMON.TRY_AGAIN'));
      },
    });
  }

  close(): void {
    this.closed.emit();
  }
}
