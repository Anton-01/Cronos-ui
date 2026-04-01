import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { CreateRecipeRequest } from 'src/app/core/models/domain.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import { PageInfoService } from 'src/app/_metronic/layout/core/page-info.service';

@Component({
  selector: 'app-receta-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AlertContainerComponent],
  templateUrl: './receta-form.component.html',
})
export class RecetaFormComponent implements OnInit, OnDestroy {
  private service = inject(RecipeService);
  private alertService = inject(AlertService);
  private pageInfoService = inject(PageInfoService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  isEditMode = signal(false);
  recipeId = signal<string | null>(null);
  isLoading = signal(false);
  isSaving = signal(false);

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
    description: ['', [Validators.maxLength(500)]],
    yieldQuantity: [null as number | null, [Validators.required, Validators.min(0.01)]],
    yieldUnit: ['', [Validators.required, Validators.maxLength(50)]],
    preparationTimeMinutes: [null as number | null, [Validators.min(0)]],
    bakingTimeMinutes: [null as number | null, [Validators.min(0)]],
    coolingTimeMinutes: [null as number | null, [Validators.min(0)]],
  });

  commonYieldUnits = [
    'Pasteles', 'Porciones', 'Piezas', 'Docenas', 'Galletas',
    'Cupcakes', 'Barras', 'Litros', 'Kilogramos',
  ];

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
      { title: '', path: '', isActive: false, isSeparator: true },
      { title: 'Recetas', path: '/cronos/recetas', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
    ]);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadRecipe(id: string): void {
    this.isLoading.set(true);
    this.service.getById(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
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
      error: err => {
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

    const obs = this.isEditMode()
      ? this.service.update(this.recipeId()!, payload)
      : this.service.create(payload);

    obs.pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.isSaving.set(false);
        this.alertService.success(
          this.isEditMode() ? 'Receta actualizada correctamente' : 'Receta creada correctamente'
        );
        // Redirect to detail view after create, or back to list after edit
        if (this.isEditMode()) {
          this.router.navigate(['/cronos/recetas', this.recipeId()!]);
        } else {
          this.router.navigate(['/cronos/recetas', res.data.id]);
        }
      },
      error: err => {
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
    this.form.controls['yieldUnit'].setValue(unit);
  }
}
