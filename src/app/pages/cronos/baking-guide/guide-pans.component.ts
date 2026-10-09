import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { PanShape, PanSize, PanSizeRequest } from 'src/app/core/models/baking-guide.models';
import { BakingGuideService } from 'src/app/core/services/domain/baking-guide.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { PortionStyle, batterVolume, panServings, panVolume } from './baking-math';

export const PAN_SHAPES: readonly PanShape[] = ['ROUND', 'SPRINGFORM', 'SQUARE', 'RECTANGULAR', 'SHEET', 'LOAF', 'BUNDT', 'MUFFIN'];
/** Shapes measured by diameter; the rest by length × width. */
export const DIAMETER_SHAPES: readonly PanShape[] = ['ROUND', 'SPRINGFORM', 'BUNDT', 'MUFFIN'];

/** Pan sizes: platform list plus the user's own pans, with capacity, batter and servings. */
@Component({
  selector: 'app-guide-pans',
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    CardModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    TagModule,
    TextareaModule,
    TooltipModule,
  ],
  templateUrl: './guide-pans.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuidePansComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(BakingGuideService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);

  readonly pans = input<readonly PanSize[]>([]);
  /** The bundled seed is showing: custom pans cannot be saved. */
  readonly offline = input(false);
  readonly changed = output<void>();

  protected readonly shapeFilter = signal<PanShape | null>(null);
  protected readonly portionStyle = signal<PortionStyle>('EVENT');
  protected readonly shapeOptions = computed(() => PAN_SHAPES.map((value) => ({ value, label: this.language.t(`GUIDE.SHAPES.${value}`) })));
  protected readonly portionOptions = computed(() =>
    (['EVENT', 'DESSERT'] as const).map((value) => ({ value, label: this.language.t(`GUIDE.PORTIONS.${value}`) })),
  );
  protected readonly rows = computed(() =>
    this.pans()
      .filter((pan) => !this.shapeFilter() || pan.shape === this.shapeFilter())
      .map((pan) => ({
        pan,
        volume: panVolume(pan),
        batter: batterVolume(pan),
        servings: panServings(pan, this.portionStyle()),
      })),
  );

  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<PanSize | null>(null);
  protected readonly saving = signal(false);
  protected readonly form = this.fb.group({
    shape: this.fb.nonNullable.control<PanShape>('ROUND', Validators.required),
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(80)]),
    diameterCm: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(120)]),
    lengthCm: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(120)]),
    widthCm: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(120)]),
    heightCm: this.fb.nonNullable.control(7.5, [Validators.required, Validators.min(0.5), Validators.max(40)]),
    volumeMl: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(100_000)]),
    servings: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(1000)]),
    notes: this.fb.control<string | null>(null, Validators.maxLength(200)),
  });
  protected readonly formShape = signal<PanShape>('ROUND');
  protected readonly usesDiameter = computed(() => DIAMETER_SHAPES.includes(this.formShape()));

  constructor() {
    this.form.controls.shape.valueChanges.subscribe((shape) => this.formShape.set(shape));
  }

  protected dimensions(pan: PanSize): string {
    const height = `${pan.heightCm} cm`;
    if (DIAMETER_SHAPES.includes(pan.shape)) {
      return pan.diameterCm ? `Ø ${pan.diameterCm} cm · ${height}` : height;
    }
    return `${pan.lengthCm ?? '—'} × ${pan.widthCm ?? pan.lengthCm ?? '—'} cm · ${height}`;
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.form.reset({ shape: 'ROUND', name: '', heightCm: 7.5 });
    this.formShape.set('ROUND');
    this.dialogOpen.set(true);
  }

  protected openEdit(pan: PanSize): void {
    this.editing.set(pan);
    this.form.reset({
      shape: pan.shape,
      name: pan.name,
      diameterCm: pan.diameterCm,
      lengthCm: pan.lengthCm,
      widthCm: pan.widthCm,
      heightCm: pan.heightCm,
      volumeMl: pan.volumeMl,
      servings: pan.servings,
      notes: pan.notes,
    });
    this.formShape.set(pan.shape);
    this.dialogOpen.set(true);
  }

  protected save(): void {
    const value = this.form.getRawValue();
    const diameter = DIAMETER_SHAPES.includes(value.shape);
    const missingSize = diameter ? !value.diameterCm : !value.lengthCm || (value.shape !== 'SQUARE' && !value.widthCm);
    if (this.form.invalid || missingSize || this.saving()) {
      this.form.markAllAsTouched();
      if (missingSize) {
        this.alert.warning(this.language.t('GUIDE.PANS.SIZE_REQUIRED'));
      }
      return;
    }
    const request: PanSizeRequest = {
      shape: value.shape,
      name: value.name.trim(),
      diameterCm: diameter ? value.diameterCm : null,
      lengthCm: diameter ? null : value.lengthCm,
      widthCm: diameter ? null : value.shape === 'SQUARE' ? value.lengthCm : value.widthCm,
      heightCm: value.heightCm,
      volumeMl: value.volumeMl,
      servings: value.servings,
      notes: value.notes?.trim() || null,
    };
    const current = this.editing();
    this.saving.set(true);
    (current ? this.service.updatePan(current.id, request) : this.service.createPan(request)).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.alert.success(this.language.t(current ? 'GUIDE.PANS.UPDATED' : 'GUIDE.PANS.CREATED', { name: request.name }));
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED')));
      },
    });
  }

  protected async remove(pan: PanSize): Promise<void> {
    if (!(await this.confirm.confirmDelete(pan.name))) {
      return;
    }
    this.service.deletePan(pan.id).subscribe({
      next: () => {
        this.alert.success(this.language.t('GUIDE.PANS.DELETED', { name: pan.name }));
        this.changed.emit();
      },
      error: (error: unknown) => this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.DELETE_FAILED'))),
    });
  }
}
