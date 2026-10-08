import { HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, model, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ImageCroppedEvent, ImageCropperComponent, ImageTransform, LoadedImage } from 'ngx-image-cropper';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { SliderModule } from 'primeng/slider';
import { TooltipModule } from 'primeng/tooltip';
import { Subscription } from 'rxjs';

import { RecipeFile } from 'src/app/core/models/kitchen.models';
import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';

export const COVER_ACCEPTED_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
/** Same per-file limit as any recipe attachment (doc kitchen §5.7). */
export const COVER_MAX_BYTES = 25 * 1024 * 1024;
export const COVER_MIN_WIDTH = 600;
/** Output: 4:3 JPEG, 1600 × 1200 — sharp on the recipe card, the studio and the book view. */
export const COVER_OUTPUT_WIDTH = 1600;
export const COVER_ASPECT = 4 / 3;

type CoverFileError = 'TYPE' | 'SIZE' | 'DIMENSIONS' | 'LOAD';

const IDENTITY: ImageTransform = { scale: 1, rotate: 0, flipH: false, flipV: false, translateH: 0, translateV: 0, translateUnit: 'px' };

/**
 * Thumbnail-style manager for the recipe cover, shown above the live cost
 * panel. Upload → crop (4:3) → save, pick one of the recipe's attached
 * images, or remove it. On a recipe that is not saved yet the cropped image
 * is held and uploaded the moment the recipe gets an id, like attachments.
 */
@Component({
  selector: 'app-recipe-cover',
  standalone: true,
  imports: [FormsModule, TranslatePipe, ImageCropperComponent, ButtonModule, DialogModule, MessageModule, ProgressBarModule, SliderModule, TooltipModule],
  templateUrl: './recipe-cover.component.html',
  styleUrl: './recipe-cover.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipeCoverComponent {
  private readonly recipeService = inject(RecipeService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('coverInput');

  readonly recipeId = input<string | null>(null);
  readonly recipeName = input('');
  readonly readonly = input(false);
  /** Shared with the files panel: the cover is the image file flagged `isCover`. */
  readonly files = model<RecipeFile[]>([]);

  protected readonly acceptedTypes = COVER_ACCEPTED_TYPES.join(',');
  protected readonly maxMegabytes = COVER_MAX_BYTES / (1024 * 1024);
  protected readonly minWidth = COVER_MIN_WIDTH;
  protected readonly outputWidth = COVER_OUTPUT_WIDTH;
  protected readonly aspect = COVER_ASPECT;

  protected readonly cover = computed(() => this.files().find((file) => file.isCover && file.kind === 'IMAGE') ?? null);
  protected readonly images = computed(() => this.files().filter((file) => file.kind === 'IMAGE'));
  /** Cropped image waiting for the first save of a new recipe. */
  protected readonly pending = signal<{ file: File; url: string } | null>(null);
  protected readonly displayUrl = computed(() => this.pending()?.url ?? this.cover()?.thumbnailUrl ?? this.cover()?.url ?? null);

  protected readonly dialogOpen = signal(false);
  protected readonly isDragOver = signal(false);
  protected readonly sourceFile = signal<File | null>(null);
  protected readonly fileError = signal<CoverFileError | null>(null);
  protected readonly cropperReady = signal(false);
  protected readonly transform = signal<ImageTransform>(IDENTITY);
  protected readonly cropped = signal<ImageCroppedEvent | null>(null);
  protected readonly zoom = computed(() => this.transform().scale ?? 1);

  protected readonly uploading = signal(false);
  protected readonly progress = signal(0);
  protected readonly busy = computed(() => this.uploading());
  private upload$: Subscription | null = null;

  constructor() {
    // A new recipe got its id: send the held cover.
    effect(() => {
      const id = this.recipeId();
      untracked(() => {
        const pending = this.pending();
        if (id && pending && !this.uploading()) {
          this.send(id, pending.file);
        }
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.upload$?.unsubscribe();
      this.revokeCrop();
      const pending = this.pending();
      if (pending) {
        URL.revokeObjectURL(pending.url);
      }
    });
  }

  // ─── Picking a file ───

  protected open(): void {
    if (this.readonly() || this.busy()) {
      return;
    }
    this.resetSource();
    this.fileError.set(null);
    this.dialogOpen.set(true);
  }

  protected browse(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onFileSelected(event: Event): void {
    const element = event.target as HTMLInputElement;
    const file = element.files?.item(0) ?? null;
    element.value = '';
    if (file) {
      this.accept(file);
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (this.readonly()) {
      return;
    }
    event.preventDefault();
    this.isDragOver.set(true);
  }

  protected onDragLeave(): void {
    this.isDragOver.set(false);
  }

  /** Dropping on the thumbnail or on the dialog's drop zone goes straight to the cropper. */
  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    const file = event.dataTransfer?.files.item(0) ?? null;
    if (file && !this.readonly() && !this.busy()) {
      this.dialogOpen.set(true);
      this.accept(file);
    }
  }

  private accept(file: File): void {
    if (!COVER_ACCEPTED_TYPES.includes(file.type)) {
      this.fileError.set('TYPE');
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      this.fileError.set('SIZE');
      return;
    }
    this.resetSource();
    this.fileError.set(null);
    this.sourceFile.set(file);
  }

  // ─── Cropper ───

  protected onImageLoaded(image: LoadedImage): void {
    if (image.original.size.width < COVER_MIN_WIDTH) {
      this.fileError.set('DIMENSIONS');
      this.resetSource();
    }
  }

  protected onCropperReady(): void {
    this.cropperReady.set(true);
  }

  protected onLoadFailed(): void {
    this.fileError.set('LOAD');
    this.resetSource();
  }

  protected onImageCropped(event: ImageCroppedEvent): void {
    this.revokeCrop();
    this.cropped.set(event);
  }

  protected onTransformChange(transform: ImageTransform): void {
    this.transform.set(transform);
  }

  protected setZoom(scale: number): void {
    this.transform.update((current) => ({ ...current, scale: Math.min(4, Math.max(1, scale)) }));
  }

  protected rotate(degrees: 90 | -90): void {
    this.transform.update((current) => ({ ...current, rotate: ((current.rotate ?? 0) + degrees) % 360 }));
  }

  protected resetTransform(): void {
    this.transform.set(IDENTITY);
  }

  // ─── Save ───

  protected apply(): void {
    const blob = this.cropped()?.blob;
    if (!blob || !this.cropperReady() || this.busy()) {
      return;
    }
    const file = new File([blob], 'cover.jpg', { type: 'image/jpeg', lastModified: Date.now() });
    const id = this.recipeId();
    if (!id) {
      this.hold(file);
      this.dialogOpen.set(false);
      this.alert.info(this.language.t('KITCHEN.COVER.WAITING_SAVE'));
      return;
    }
    this.send(id, file);
  }

  private hold(file: File): void {
    const previous = this.pending();
    if (previous) {
      URL.revokeObjectURL(previous.url);
    }
    this.pending.set({ file, url: URL.createObjectURL(file) });
  }

  private send(recipeId: string, file: File): void {
    this.uploading.set(true);
    this.progress.set(0);
    this.upload$ = this.recipeService.uploadCover(recipeId, file).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.progress.set(Math.round((event.loaded / event.total) * 100));
        } else if (event.type === HttpEventType.Response) {
          const saved = event.body?.data;
          this.uploading.set(false);
          if (saved) {
            this.setCover(saved);
          }
          this.clearPending();
          this.dialogOpen.set(false);
          this.alert.success(this.language.t('KITCHEN.FILES.COVER_SET'));
        }
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        // A held cover stays held and the thumbnail offers a retry; a direct upload keeps the crop open.
        this.alert.error(catalogErrorMessage(error, this.language.t('KITCHEN.COVER.UPLOAD_FAILED')));
      },
    });
  }

  protected retryPending(): void {
    const id = this.recipeId();
    const pending = this.pending();
    if (id && pending && !this.uploading()) {
      this.send(id, pending.file);
    }
  }

  /** Uses an image already attached to the recipe. */
  protected choose(file: RecipeFile): void {
    const id = this.recipeId();
    if (!id || file.isCover || this.busy()) {
      return;
    }
    this.uploading.set(true);
    this.recipeService.updateFile(id, file.id, { description: file.description, isCover: true }).subscribe({
      next: (response) => {
        this.uploading.set(false);
        this.setCover(response.data ?? { ...file, isCover: true });
        this.dialogOpen.set(false);
        this.alert.success(this.language.t('KITCHEN.FILES.COVER_SET'));
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.COMMON.ACTION_FAILED')));
      },
    });
  }

  protected async remove(): Promise<void> {
    if (this.pending()) {
      this.clearPending();
      return;
    }
    const id = this.recipeId();
    const confirmed = await this.confirm.confirm({
      title: this.language.t('KITCHEN.COVER.REMOVE_TITLE'),
      message: this.language.t('KITCHEN.COVER.REMOVE_MESSAGE'),
      severity: 'danger',
      icon: 'pi pi-image',
    });
    if (!id || !confirmed) {
      return;
    }
    this.uploading.set(true);
    this.recipeService.clearCover(id).subscribe({
      next: () => {
        this.uploading.set(false);
        this.files.update((list) => list.map((entry) => (entry.isCover ? { ...entry, isCover: false } : entry)));
        this.alert.success(this.language.t('KITCHEN.COVER.REMOVED'));
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.COMMON.ACTION_FAILED')));
      },
    });
  }

  /** `true` while a cropped cover waits for the recipe's first save (used by the leave guard). */
  hasPendingCover(): boolean {
    return this.pending() !== null || this.uploading();
  }

  protected onDialogVisible(visible: boolean): void {
    if (!visible && this.uploading()) {
      return;
    }
    this.dialogOpen.set(visible);
  }

  protected onDialogHide(): void {
    this.resetSource();
  }

  private setCover(saved: RecipeFile): void {
    this.files.update((list) => {
      const others = list.filter((entry) => entry.id !== saved.id).map((entry) => (entry.isCover ? { ...entry, isCover: false } : entry));
      return [{ ...saved, isCover: true }, ...others];
    });
  }

  private clearPending(): void {
    const pending = this.pending();
    if (pending) {
      URL.revokeObjectURL(pending.url);
    }
    this.pending.set(null);
  }

  private resetSource(): void {
    this.sourceFile.set(null);
    this.revokeCrop();
    this.cropped.set(null);
    this.cropperReady.set(false);
    this.transform.set(IDENTITY);
  }

  /** ngx-image-cropper never revokes the URLs it mints per crop. */
  private revokeCrop(): void {
    const url = this.cropped()?.objectUrl;
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
