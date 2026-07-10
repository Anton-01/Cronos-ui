import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChipModule } from 'primeng/chip';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';

import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { CreateRecipeRequest } from 'src/app/core/models/domain.model';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';

const COMMON_YIELD_UNITS = [
  'Pasteles',
  'Porciones',
  'Piezas',
  'Docenas',
  'Galletas',
  'Cupcakes',
  'Barras',
  'Litros',
  'Kilogramos',
];

@Component({
  selector: 'app-recipe-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    ChipModule,
    InputNumberModule,
    InputTextModule,
    TextareaModule,
  ],
  templateUrl: './recipe-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipeFormComponent implements OnInit, OnDestroy {
  private readonly recipeService = inject(RecipeService);
  private readonly alertService = inject(AlertService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy$ = new Subject<void>();

  readonly isEditMode = signal(false);
  readonly recipeId = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);

  readonly commonYieldUnits = COMMON_YIELD_UNITS;

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
    description: ['', [Validators.maxLength(500)]],
    yieldQuantity: [null as number | null, [Validators.required, Validators.min(0.01)]],
    yieldUnit: ['', [Validators.required, Validators.maxLength(50)]],
    preparationTimeMinutes: [null as number | null, [Validators.min(0)]],
    bakingTimeMinutes: [null as number | null, [Validators.min(0)]],
    coolingTimeMinutes: [null as number | null, [Validators.min(0)]],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode.set(true);
      this.recipeId.set(id);
      this.loadRecipe(id);
    }

    this.pageInfoService.updateTitle(id ? 'Editar Receta' : 'Nueva Receta');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: 'Recetas', path: '/cronos/recetas', isActive: false },
      { title: id ? 'Editar' : 'Nueva', path: '', isActive: true },
    ]);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadRecipe(id: string): void {
    this.isLoading.set(true);
    this.recipeService.getById(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.form.patchValue({
          name: res.data.name,
          description: res.data.description ?? '',
          yieldQuantity: res.data.yieldQuantity,
          yieldUnit: res.data.yieldUnit,
          preparationTimeMinutes: res.data.preparationTimeMinutes,
          bakingTimeMinutes: res.data.bakingTimeMinutes,
          coolingTimeMinutes: res.data.coolingTimeMinutes,
        });
        this.isLoading.set(false);
      },
      error: (err) => {
        this.alertService.error(err?.error?.message || 'Error al cargar la receta');
        this.isLoading.set(false);
      },
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const payload: CreateRecipeRequest = {
      name: this.form.value.name!,
      description: this.form.value.description || undefined,
      yieldQuantity: this.form.value.yieldQuantity!,
      yieldUnit: this.form.value.yieldUnit!,
      preparationTimeMinutes: this.form.value.preparationTimeMinutes ?? undefined,
      bakingTimeMinutes: this.form.value.bakingTimeMinutes ?? undefined,
      coolingTimeMinutes: this.form.value.coolingTimeMinutes ?? undefined,
    };

    const request$ = this.isEditMode()
      ? this.recipeService.update(this.recipeId()!, payload)
      : this.recipeService.create(payload);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.alertService.success(
          this.isEditMode() ? 'Receta actualizada correctamente' : 'Receta creada correctamente'
        );
        // Redirect to detail view after create, or back to detail after edit
        const targetId = this.isEditMode() ? this.recipeId()! : res.data.id;
        this.router.navigate(['/cronos/recetas', targetId]);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.alertService.error(err?.error?.message || 'Error al guardar la receta');
      },
    });
  }

  cancel(): void {
    if (this.isEditMode()) {
      this.router.navigate(['/cronos/recetas', this.recipeId()!]);
    } else {
      this.router.navigate(['/cronos/recetas']);
    }
  }

  selectYieldUnit(unit: string): void {
    this.form.controls.yieldUnit.setValue(unit);
  }
}
