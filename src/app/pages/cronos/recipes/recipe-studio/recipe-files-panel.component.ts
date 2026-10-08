import { DatePipe } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, model, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { Subscription } from 'rxjs';

import { RecipeFile } from 'src/app/core/models/kitchen.models';
import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { FILE_KIND_ICON, formatBytes } from '../../kitchen-shared/kitchen-labels';

/** Mirrors doc §5.6 — the server enforces the same limits and sniffs the real type. */
export const RECIPE_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const RECIPE_FILES_MAX = 40;
const ACCEPTED: Readonly<Record<string, string>> = {
  'image/jpeg': 'IMAGE',
  'image/png': 'IMAGE',
  'image/webp': 'IMAGE',
  'application/pdf': 'PDF',
  'application/msword': 'DOCUMENT',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCUMENT',
  'application/vnd.ms-excel': 'SPREADSHEET',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'SPREADSHEET',
  'text/plain': 'DOCUMENT',
  'video/mp4': 'VIDEO',
};
const CONCURRENCY = 3;

type UploadState = 'QUEUED' | 'UPLOADING' | 'DONE' | 'FAILED';

export interface QueuedUpload {
  key: string;
  file: File;
  description: string;
  progress: number;
  state: UploadState;
  error: string | null;
}

/**
 * Recipe attachments: drop or pick N files; each uploads on its own request
 * (3 at a time) with a progress bar, can be retried or cancelled, and is
 * validated for type and size before leaving the browser. Files added while
 * the recipe is still unsaved stay queued and upload as soon as it gets an id.
 */
@Component({
  selector: 'app-recipe-files-panel',
  standalone: true,
  imports: [DatePipe, FormsModule, TranslatePipe, ButtonModule, DialogModule, InputTextModule, MessageModule, ProgressBarModule, TagModule, TooltipModule],
  templateUrl: './recipe-files-panel.component.html',
  styleUrl: './recipe-files-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipeFilesPanelComponent {
  private readonly recipeService = inject(RecipeService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);

  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('picker');

  /** `null` while the recipe has not been saved yet. */
  readonly recipeId = input<string | null>(null);
  readonly files = model<RecipeFile[]>([]);
  readonly readonly = input(false);

  protected readonly accept = Object.keys(ACCEPTED).join(',');
  protected readonly maxMb = RECIPE_FILE_MAX_BYTES / (1024 * 1024);
  protected readonly maxFiles = RECIPE_FILES_MAX;
  protected readonly kindIcon: Readonly<Record<string, string>> = FILE_KIND_ICON;
  protected readonly queue = signal<QueuedUpload[]>([]);
  protected readonly dragOver = signal(false);
  protected readonly editing = signal<RecipeFile | null>(null);
  protected readonly editDescription = signal('');
  protected readonly preview = signal<RecipeFile | null>(null);

  protected readonly pending = computed(() => this.queue().filter((item) => item.state !== 'DONE'));
  protected readonly uploading = computed(() => this.queue().some((item) => item.state === 'UPLOADING'));

  private readonly inflight = new Map<string, Subscription>();
  private sequence = 0;

  constructor() {
    // A freshly saved recipe flushes whatever was queued while it had no id.
    effect(() => {
      if (this.recipeId()) {
        untracked(() => this.pump());
      }
    });
    inject(DestroyRef).onDestroy(() => this.inflight.forEach((subscription) => subscription.unsubscribe()));
  }

  /** True while uploads are queued or running — the studio warns before leaving. */
  hasPendingUploads(): boolean {
    return this.pending().some((item) => item.state === 'QUEUED' || item.state === 'UPLOADING');
  }

  protected browse(): void {
    this.picker().nativeElement.click();
  }

  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.enqueue(Array.from(input.files ?? []));
    input.value = '';
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    if (!this.readonly()) {
      this.enqueue(Array.from(event.dataTransfer?.files ?? []));
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  private enqueue(files: File[]): void {
    const rejected: string[] = [];
    const room = RECIPE_FILES_MAX - this.files().length - this.pending().length;
    const accepted: QueuedUpload[] = [];
    for (const file of files) {
      if (!ACCEPTED[file.type]) {
        rejected.push(this.language.t('KITCHEN.FILES.REJECT_TYPE', { name: file.name }));
      } else if (file.size > RECIPE_FILE_MAX_BYTES) {
        rejected.push(this.language.t('KITCHEN.FILES.REJECT_SIZE', { name: file.name, max: this.maxMb }));
      } else if (file.size === 0) {
        rejected.push(this.language.t('KITCHEN.FILES.REJECT_EMPTY', { name: file.name }));
      } else if (accepted.length >= room) {
        rejected.push(this.language.t('KITCHEN.FILES.REJECT_COUNT', { name: file.name, max: RECIPE_FILES_MAX }));
      } else {
        this.sequence += 1;
        accepted.push({ key: `up-${this.sequence}`, file, description: '', progress: 0, state: 'QUEUED', error: null });
      }
    }
    if (rejected.length > 0) {
      this.alert.warning(rejected.join(' · '), this.language.t('KITCHEN.FILES.REJECTED_TITLE'));
    }
    if (accepted.length > 0) {
      this.queue.update((list) => [...list, ...accepted]);
      this.pump();
    }
  }

  /** Starts queued uploads up to the concurrency limit. */
  private pump(): void {
    const recipeId = this.recipeId();
    if (!recipeId) {
      return;
    }
    const running = this.queue().filter((item) => item.state === 'UPLOADING').length;
    const next = this.queue().filter((item) => item.state === 'QUEUED').slice(0, Math.max(0, CONCURRENCY - running));
    for (const item of next) {
      this.start(recipeId, item);
    }
  }

  private start(recipeId: string, item: QueuedUpload): void {
    this.update(item.key, { state: 'UPLOADING', progress: 0, error: null });
    const subscription = this.recipeService.uploadFile(recipeId, item.file, item.description.trim() || null).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.update(item.key, { progress: Math.round((event.loaded / event.total) * 100) });
        } else if (event.type === HttpEventType.Response) {
          const uploaded = event.body?.data;
          if (uploaded) {
            this.files.update((list) => [...list, uploaded]);
          }
          this.update(item.key, { state: 'DONE', progress: 100 });
        }
      },
      error: (error: unknown) => {
        this.inflight.delete(item.key);
        this.update(item.key, { state: 'FAILED', error: catalogErrorMessage(error, this.language.t('KITCHEN.FILES.UPLOAD_FAILED')) });
        this.pump();
      },
      complete: () => {
        this.inflight.delete(item.key);
        // Finished rows leave the queue after a moment so the grid shows the file instead.
        setTimeout(() => this.queue.update((list) => list.filter((entry) => !(entry.key === item.key && entry.state === 'DONE'))), 1500);
        this.pump();
      },
    });
    this.inflight.set(item.key, subscription);
  }

  protected retry(item: QueuedUpload): void {
    this.update(item.key, { state: 'QUEUED', error: null, progress: 0 });
    this.pump();
  }

  protected cancel(item: QueuedUpload): void {
    this.inflight.get(item.key)?.unsubscribe();
    this.inflight.delete(item.key);
    this.queue.update((list) => list.filter((entry) => entry.key !== item.key));
    this.pump();
  }

  protected setQueuedDescription(item: QueuedUpload, description: string): void {
    this.update(item.key, { description });
  }

  private update(key: string, change: Partial<QueuedUpload>): void {
    this.queue.update((list) => list.map((entry) => (entry.key === key ? { ...entry, ...change } : entry)));
  }

  // ─── Uploaded files ───

  protected openEdit(file: RecipeFile): void {
    this.editing.set(file);
    this.editDescription.set(file.description ?? '');
  }

  protected saveEdit(): void {
    const file = this.editing();
    const recipeId = this.recipeId();
    if (!file || !recipeId) {
      return;
    }
    this.recipeService.updateFile(recipeId, file.id, { description: this.editDescription().trim() || null, isCover: file.isCover }).subscribe({
      next: (response) => {
        const updated = response.data;
        if (updated) {
          this.files.update((list) => list.map((entry) => (entry.id === updated.id ? updated : entry)));
        }
        this.editing.set(null);
      },
      error: (error: unknown) => this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED'))),
    });
  }

  protected makeCover(file: RecipeFile): void {
    const recipeId = this.recipeId();
    if (!recipeId || file.kind !== 'IMAGE') {
      return;
    }
    this.recipeService.updateFile(recipeId, file.id, { description: file.description, isCover: true }).subscribe({
      next: () => {
        this.files.update((list) => list.map((entry) => ({ ...entry, isCover: entry.id === file.id })));
        this.alert.success(this.language.t('KITCHEN.FILES.COVER_SET'));
      },
      error: (error: unknown) => this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED'))),
    });
  }

  protected async remove(file: RecipeFile): Promise<void> {
    const recipeId = this.recipeId();
    if (!recipeId || !(await this.confirm.confirmDelete(file.fileName))) {
      return;
    }
    this.recipeService.deleteFile(recipeId, file.id).subscribe({
      next: () => {
        this.files.update((list) => list.filter((entry) => entry.id !== file.id));
        this.alert.success(this.language.t('KITCHEN.FILES.DELETED'));
      },
      error: (error: unknown) => this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.DELETE_FAILED'))),
    });
  }

  protected size(bytes: number): string {
    return formatBytes(bytes);
  }

  protected iconForType(type: string): string {
    return FILE_KIND_ICON[(ACCEPTED[type] ?? 'OTHER') as keyof typeof FILE_KIND_ICON];
  }
}
