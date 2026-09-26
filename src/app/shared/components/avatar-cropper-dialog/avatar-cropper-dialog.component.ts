import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ImageCroppedEvent, ImageCropperComponent, ImageTransform, LoadedImage } from 'ngx-image-cropper';

import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { SliderModule } from 'primeng/slider';
import { TooltipModule } from 'primeng/tooltip';

import { CroppedAvatar } from 'src/app/core/models';

/** Why a picked file was refused before (or while) it reached the cropper. */
export type AvatarFileError = 'TYPE' | 'SIZE' | 'DIMENSIONS' | 'LOAD';

export const AVATAR_ACCEPTED_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_MAX_BYTES = 10 * 1024 * 1024;
/** Smallest source edge accepted; below this the 512px output would be upscaled mush. */
export const AVATAR_MIN_SOURCE_EDGE = 256;
/** Output is always a square JPEG of this edge — the contract the API stores. */
export const AVATAR_OUTPUT_EDGE = 512;

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.05;

const IDENTITY_TRANSFORM: ImageTransform = {
  scale: 1,
  rotate: 0,
  flipH: false,
  flipV: false,
  translateH: 0,
  translateV: 0,
  translateUnit: 'px',
};

/**
 * Upload → crop → confirm dialog for profile pictures.
 *
 * Precision controls: 1:1 circular frame, zoom slider (1×–4×, also mouse
 * wheel), drag-to-pan the image under the frame, 90° rotation, horizontal
 * flip, reset, and a live preview at the size the avatar is rendered.
 *
 * Emits a server-ready `File` (512×512 JPEG, q=0.9, white matte behind any
 * transparency). The dialog stays open while the parent uploads (`saving`),
 * and the parent closes it on success so a failed upload keeps the crop.
 */
@Component({
  selector: 'app-avatar-cropper-dialog',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    ImageCropperComponent,
    ButtonModule,
    DialogModule,
    MessageModule,
    SliderModule,
    TooltipModule,
  ],
  templateUrl: './avatar-cropper-dialog.component.html',
  styleUrl: './avatar-cropper-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarCropperDialogComponent {
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  readonly visible = model(false);
  /** Parent upload in flight — locks the controls and spins the confirm button. */
  readonly saving = input(false);
  readonly confirmed = output<CroppedAvatar>();

  protected readonly acceptedTypes = AVATAR_ACCEPTED_TYPES.join(',');
  protected readonly maxMegabytes = AVATAR_MAX_BYTES / (1024 * 1024);
  protected readonly minEdge = AVATAR_MIN_SOURCE_EDGE;
  protected readonly outputEdge = AVATAR_OUTPUT_EDGE;
  protected readonly zoomMin = ZOOM_MIN;
  protected readonly zoomMax = ZOOM_MAX;
  protected readonly zoomStep = ZOOM_STEP;

  protected readonly sourceFile = signal<File | null>(null);
  protected readonly fileError = signal<AvatarFileError | null>(null);
  protected readonly isDragOver = signal(false);
  protected readonly cropperReady = signal(false);
  protected readonly transform = signal<ImageTransform>(IDENTITY_TRANSFORM);
  protected readonly cropped = signal<ImageCroppedEvent | null>(null);

  protected readonly zoom = computed(() => this.transform().scale ?? 1);
  protected readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  protected readonly previewUrl = computed(() => this.cropped()?.objectUrl ?? null);
  protected readonly canConfirm = computed(
    () => this.cropperReady() && !!this.cropped()?.blob && !this.saving(),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revokePreview());
  }

  // ─── File selection ───

  protected browse(): void {
    this.fileInput().nativeElement.click();
  }

  protected onFileSelected(event: Event): void {
    const element = event.target as HTMLInputElement;
    const file = element.files?.item(0) ?? null;
    // Reset so picking the same file again still fires `change`.
    element.value = '';
    if (file) {
      this.accept(file);
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  protected onDragLeave(): void {
    this.isDragOver.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    const file = event.dataTransfer?.files.item(0) ?? null;
    if (file) {
      this.accept(file);
    }
  }

  private accept(file: File): void {
    if (!AVATAR_ACCEPTED_TYPES.includes(file.type)) {
      this.fileError.set('TYPE');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      this.fileError.set('SIZE');
      return;
    }
    this.resetCropState();
    this.fileError.set(null);
    this.sourceFile.set(file);
  }

  // ─── Cropper events ───

  protected onImageLoaded(image: LoadedImage): void {
    const { width, height } = image.original.size;
    if (Math.min(width, height) < AVATAR_MIN_SOURCE_EDGE) {
      this.fileError.set('DIMENSIONS');
      this.clearSource();
    }
  }

  protected onCropperReady(): void {
    this.cropperReady.set(true);
  }

  protected onLoadFailed(): void {
    this.fileError.set('LOAD');
    this.clearSource();
  }

  /**
   * ngx-image-cropper mints a fresh `blob:` URL for every crop and never
   * revokes the old one, so a long drag session would leak one per frame.
   */
  protected onImageCropped(event: ImageCroppedEvent): void {
    this.revokePreview();
    this.cropped.set(event);
  }

  protected onTransformChange(transform: ImageTransform): void {
    this.transform.set(transform);
  }

  // ─── Precision controls ───

  protected setZoom(scale: number): void {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(scale / ZOOM_STEP) * ZOOM_STEP));
    this.transform.update((current) => ({ ...current, scale: clamped }));
  }

  protected zoomBy(delta: number): void {
    this.setZoom(this.zoom() + delta);
  }

  protected onWheel(event: WheelEvent): void {
    if (!this.sourceFile()) {
      return;
    }
    event.preventDefault();
    this.zoomBy(event.deltaY < 0 ? ZOOM_STEP * 2 : -ZOOM_STEP * 2);
  }

  protected rotate(degrees: 90 | -90): void {
    this.transform.update((current) => ({ ...current, rotate: ((current.rotate ?? 0) + degrees) % 360 }));
  }

  protected flipHorizontal(): void {
    this.transform.update((current) => ({ ...current, flipH: !current.flipH }));
  }

  protected resetTransform(): void {
    this.transform.set(IDENTITY_TRANSFORM);
  }

  // ─── Confirm / close ───

  protected confirm(): void {
    const event = this.cropped();
    if (!this.canConfirm() || !event?.blob) {
      return;
    }
    const file = new File([event.blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() });
    this.confirmed.emit({
      file,
      // A separate URL the parent owns, so closing this dialog (which revokes
      // the cropper's preview URL) cannot blank the parent's optimistic avatar.
      previewUrl: URL.createObjectURL(file),
      width: event.width,
      height: event.height,
    });
  }

  protected onVisibleChange(visible: boolean): void {
    if (!visible && this.saving()) {
      return;
    }
    this.visible.set(visible);
  }

  /** Clears everything when the dialog finishes hiding, ready for the next open. */
  protected onHide(): void {
    this.clearSource();
    this.fileError.set(null);
  }

  protected changeImage(): void {
    this.browse();
  }

  private clearSource(): void {
    this.sourceFile.set(null);
    this.resetCropState();
  }

  private resetCropState(): void {
    this.revokePreview();
    this.cropped.set(null);
    this.cropperReady.set(false);
    this.transform.set(IDENTITY_TRANSFORM);
  }

  private revokePreview(): void {
    const url = this.cropped()?.objectUrl;
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
