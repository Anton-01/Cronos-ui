import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';
import { map } from 'rxjs';
import { UserService } from 'src/app/core/services/user.service';
import { RoleService } from 'src/app/core/services/role.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { UserResponse } from 'src/app/core/models/user.model';
import { RoleResponse } from 'src/app/core/models/role.model';

@Component({
  selector: 'app-create-user-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbTooltipModule, ImageCropperComponent],
  templateUrl: './create-user-modal.component.html',
})
export class CreateUserModalComponent implements OnInit, OnDestroy {
  private userService = inject(UserService);
  private roleService = inject(RoleService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  @Output() closed = new EventEmitter<void>();
  @Output() userCreated = new EventEmitter<UserResponse>();

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  // ─── Roles state ─────────────────────────────────────────────────────────────
  availableRoles = signal<RoleResponse[]>([]);
  /** Stores numeric role IDs — matches backend Set<Long> roleIds */
  selectedRoleIds = signal<Set<number>>(new Set());
  isLoadingRoles = signal(false);

  // ─── Image cropper state ─────────────────────────────────────────────────────
  imageChangedEvent: Event | null = null;
  croppedBlob: Blob | null = null;
  croppedPreview: string | null = null;
  hasCropperImage = signal(false);
  imageLoadError = signal(false);

  // ─── Misc ─────────────────────────────────────────────────────────────────────
  isSaving = signal(false);

  // ─── Reactive Form ────────────────────────────────────────────────────────────
  form = this.fb.group({
    username:    ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
    email:       ['', [Validators.required, Validators.email]],
    firstName:   [''],
    lastName:    [''],
    phoneNumber: [''],
  });

  /**
   * Bridge reactive-form status to a Signal so computed() can track it.
   * Without this, computed() would never re-evaluate when form validity changes.
   */
  private formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });

  /** Save is allowed when: form valid + at least one role selected + not already saving */
  canSubmit = computed(() =>
    this.formStatus() === 'VALID' &&
    this.selectedRoleIds().size > 0 &&
    !this.isSaving(),
  );

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadRoles();
    document.body.classList.add('modal-open');
  }

  ngOnDestroy(): void {
    document.body.classList.remove('modal-open');
    // Revoke any object URLs created during cropping
    if (this.croppedPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(this.croppedPreview);
    }
  }

  // ─── Roles ───────────────────────────────────────────────────────────────────

  loadRoles(): void {
    this.isLoadingRoles.set(true);
    this.roleService.getAll().subscribe({
      next: res => {
        this.availableRoles.set(res.data);
        this.isLoadingRoles.set(false);
      },
      error: () => {
        this.isLoadingRoles.set(false);
        this.toast.error('Error', 'No se pudieron cargar los roles disponibles');
      },
    });
  }

  toggleRole(roleId: number): void {
    this.selectedRoleIds.update(set => {
      const next = new Set(set);
      next.has(roleId) ? next.delete(roleId) : next.add(roleId);
      return next;
    });
  }

  isRoleSelected(roleId: number): boolean {
    return this.selectedRoleIds().has(roleId);
  }

  // ─── Image Cropper ────────────────────────────────────────────────────────────

  triggerFileInput(): void {
    this.fileInputRef.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

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

  onImageLoaded(): void { /* image parsed and ready to crop */ }
  onCropperReady(): void { /* cropper UI initialised */ }

  onLoadImageFailed(): void {
    this.imageLoadError.set(true);
    this.hasCropperImage.set(false);
    this.imageChangedEvent = null;
    this.toast.error('Formato inválido', 'Usa una imagen JPG, PNG o WEBP');
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

  // ─── FormData Helpers ────────────────────────────────────────────────────────

  private buildFormData(): FormData {
    const fd = new FormData();

    const userData = {
      username:    this.form.value.username!.trim(),
      email:       this.form.value.email!.trim(),
      firstName:   this.form.value.firstName?.trim() || null,
      lastName:    this.form.value.lastName?.trim() || null,
      phoneNumber: this.form.value.phoneNumber?.trim() || null,
      roleIds:     Array.from(this.selectedRoleIds()), // number[], matches Set<Long>
    };

    // Backend expects: @RequestPart("userData") — must be application/json Blob
    fd.append('userData', new Blob([JSON.stringify(userData)], { type: 'application/json' }));

    // Backend expects: @RequestPart("profilePicture") — optional
    if (this.croppedBlob) {
      fd.append('profilePicture', this.croppedBlob, 'avatar.jpg');
    }

    return fd;
  }

  // ─── Submit ───────────────────────────────────────────────────────────────────

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (!this.canSubmit()) return;

    this.isSaving.set(true);
    this.userService.registerUser(this.buildFormData()).subscribe({
      next: res => {
        this.isSaving.set(false);
        this.toast.success('Usuario creado', `"${res.data.username}" fue registrado exitosamente`);
        this.userCreated.emit(res.data);
        this.close();
      },
      error: err => {
        this.isSaving.set(false);
        this.toast.error('Error al crear usuario', err?.error?.message ?? 'Inténtalo de nuevo');
      },
    });
  }

  // ─── Close ────────────────────────────────────────────────────────────────────

  close(): void {
    this.closed.emit();
  }

  /** Close when clicking the darkened backdrop (not the modal card itself) */
  onBackdropClick(event: MouseEvent): void {
    if ((event.target as Element).classList.contains('modal')) {
      this.close();
    }
  }
}
