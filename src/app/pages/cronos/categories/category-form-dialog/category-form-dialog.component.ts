import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';

import { CategoryService } from 'src/app/core/services/domain/category.service';
import {
  CategoryResponse,
  CategoryType,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from 'src/app/core/models/category.model';
import { ApiErrorDetail } from 'src/app/core/models';
import { apiErrorMessage, apiErrors } from 'src/app/core/utils/api-error.util';
import { AlertService } from 'src/app/shared/services/alert.service';
import { CATEGORY_TYPE_OPTIONS, categoryTypeLabel } from '../category-presentation';

export const CATEGORY_NAME_MAX_LENGTH = 60;
export const CATEGORY_DESCRIPTION_MAX_LENGTH = 255;

/**
 * A clean category name: starts with a letter or digit, then letters, digits,
 * single inner spaces and a short set of punctuation. Unicode-aware so
 * "Panadería" and "Repostería fina" pass while "  ", "--" or "<b>" do not.
 */
const CATEGORY_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .,&'()/-]*$/u;

/** Rejects values whose stored form would differ from what the user typed. */
function cleanNameValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: unknown = control.value;
    if (typeof value !== 'string' || value.length === 0) {
      return null;
    }
    if (value !== value.trim()) {
      return { surroundingWhitespace: true };
    }
    if (/\s{2,}/.test(value)) {
      return { repeatedWhitespace: true };
    }
    return CATEGORY_NAME_PATTERN.test(value) ? null : { cleanName: true };
  };
}

/** Which form control an `errors[].field` maps onto. */
const SERVER_FIELD_TO_CONTROL: Readonly<Record<string, 'name' | 'description' | 'type'>> = {
  name: 'name',
  description: 'description',
  type: 'type',
};

/**
 * Create / edit / view dialog for a single category.
 *
 * `type` is rendered as an editable selector only while creating — the backend
 * fixes it at creation and rejects any later change, so the edit form shows it
 * as a static tag instead. In `readOnly` mode (a SYSTEM row) every control is
 * disabled and the footer collapses to a single "Cerrar".
 */
@Component({
  selector: 'app-category-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TagModule,
    TextareaModule,
  ],
  templateUrl: './category-form-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryFormDialogComponent implements OnInit {
  private readonly categoryService = inject(CategoryService);
  private readonly alertService = inject(AlertService);
  private readonly fb = inject(FormBuilder);

  /** Type the list is scoped to — the default for a new category. */
  readonly type = input.required<CategoryType>();

  /** Row being edited or inspected; `null` opens the dialog in create mode. */
  readonly category = input<CategoryResponse | null>(null);

  /** Inspect-only: SYSTEM rows are immutable for every caller. */
  readonly readOnly = input(false);

  /** Emitted with the persisted row after a successful create or update. */
  readonly saved = output<CategoryResponse>();

  /** Emitted when the dialog should be torn down. */
  readonly closed = output<void>();

  /**
   * Emitted when the server rejected the write because the row is not the
   * caller's to change — the list state is stale and should be refetched.
   */
  readonly desynced = output<void>();

  readonly isSaving = signal(false);

  readonly maxNameLength = CATEGORY_NAME_MAX_LENGTH;
  readonly maxDescriptionLength = CATEGORY_DESCRIPTION_MAX_LENGTH;
  readonly typeOptions = CATEGORY_TYPE_OPTIONS;

  readonly form = this.fb.nonNullable.group({
    name: [
      '',
      [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(CATEGORY_NAME_MAX_LENGTH),
        cleanNameValidator(),
      ],
    ],
    description: ['', [Validators.maxLength(CATEGORY_DESCRIPTION_MAX_LENGTH)]],
    type: this.fb.nonNullable.control<CategoryType>('PRODUCT', [Validators.required]),
  });

  readonly isEditMode = computed(() => this.category() !== null);

  readonly header = computed(() => {
    if (this.readOnly()) {
      return 'Detalle de categoría';
    }
    return this.isEditMode() ? 'Editar categoría' : 'Nueva categoría';
  });

  /** The type shown as a static tag on the edit / view form. */
  readonly lockedTypeLabel = computed(() => categoryTypeLabel(this.category()?.type ?? this.type()));

  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  readonly canSubmit = computed(() => this.formStatus() === 'VALID' && !this.isSaving() && !this.readOnly());

  constructor() {
    // A server-side rejection is pinned to the control it came from; typing
    // again is the signal that the user is addressing it, so drop it and let
    // the synchronous validators speak for the field once more.
    for (const control of [this.form.controls.name, this.form.controls.description]) {
      control.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
        if (control.hasError('server') || control.hasError('duplicate')) {
          control.updateValueAndValidity({ emitEvent: false });
        }
      });
    }

    effect(() => {
      if (this.readOnly()) {
        this.form.disable({ emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    const current = this.category();
    this.form.reset({
      name: current?.name ?? '',
      description: current?.description ?? '',
      type: current?.type ?? this.type(),
    });
  }

  close(): void {
    this.closed.emit();
  }

  onSubmit(): void {
    if (this.readOnly()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, description, type } = this.form.getRawValue();
    const trimmedDescription = description.trim();
    const current = this.category();

    this.isSaving.set(true);

    if (current) {
      const payload: UpdateCategoryRequest = {
        name: name.trim(),
        description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
      };
      this.categoryService.update(current.id, payload).subscribe({
        next: (res) => this.onWriteSuccess(res.data, 'Categoría actualizada correctamente'),
        error: (err: unknown) => this.onWriteError(err, 'No se pudo actualizar la categoría'),
      });
      return;
    }

    const payload: CreateCategoryRequest = {
      name: name.trim(),
      description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
      type,
    };
    this.categoryService.create(payload).subscribe({
      next: (res) => this.onWriteSuccess(res.data, 'Categoría creada correctamente'),
      error: (err: unknown) => this.onWriteError(err, 'No se pudo crear la categoría'),
    });
  }

  private onWriteSuccess(category: CategoryResponse, message: string): void {
    this.isSaving.set(false);
    this.alertService.success(message);
    this.saved.emit(category);
  }

  /**
   * Field-scoped failures land on the control that caused them; ownership
   * failures mean the list is stale, so the dialog closes and asks the parent
   * to refetch rather than leaving the user staring at a form they cannot save.
   */
  private onWriteError(error: unknown, fallback: string): void {
    this.isSaving.set(false);
    const details = apiErrors(error);

    for (const detail of details) {
      switch (detail.code) {
        case 'VALIDATION_FIELD_ERROR':
          this.applyFieldError(detail, 'Valor no válido');
          break;
        case 'DUPLICATE_RESOURCE':
          this.form.controls.name.setErrors({
            duplicate: detail.message ?? 'Ya existe una categoría con este nombre',
          });
          this.form.controls.name.markAsTouched();
          break;
        case 'SYSTEM_RESOURCE_CONFLICT':
          this.alertService.error(
            detail.message ?? 'Las categorías del sistema no se pueden modificar',
            'Categoría protegida',
          );
          this.desynced.emit();
          this.close();
          return;
        case 'UNAUTHORIZED_MODIFICATION':
          this.alertService.error(
            detail.message ?? 'Esta categoría pertenece a otro usuario',
            'Acción no permitida',
          );
          this.desynced.emit();
          this.close();
          return;
      }
    }

    const handledEveryDetail =
      details.length > 0 &&
      details.every(
        (detail) => detail.code === 'VALIDATION_FIELD_ERROR' || detail.code === 'DUPLICATE_RESOURCE',
      );
    if (!handledEveryDetail) {
      this.alertService.error(apiErrorMessage(error, fallback));
    }
  }

  private applyFieldError(detail: ApiErrorDetail, fallback: string): void {
    const controlName = detail.field ? SERVER_FIELD_TO_CONTROL[detail.field] : undefined;
    if (!controlName) {
      this.alertService.error(detail.message ?? fallback);
      return;
    }
    const control = this.form.controls[controlName];
    control.setErrors({ server: detail.message ?? fallback });
    control.markAsTouched();
  }

  /** The server-supplied text pinned to a control, if any. */
  serverError(controlName: 'name' | 'description' | 'type'): string | null {
    const errors = this.form.controls[controlName].errors;
    const message: unknown = errors?.['server'] ?? errors?.['duplicate'];
    return typeof message === 'string' ? message : null;
  }

  isInvalid(controlName: 'name' | 'description' | 'type'): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }
}
