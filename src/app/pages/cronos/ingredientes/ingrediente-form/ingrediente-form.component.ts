import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-ingrediente-form',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card">
      <div class="card-header border-0 pt-6">
        <div class="card-title">
          <h2>{{ isEdit ? 'Editar' : 'Nuevo' }} Ingrediente</h2>
        </div>
        <div class="card-toolbar">
          <button class="btn btn-light" (click)="goBack()">
            <i class="ki-duotone ki-arrow-left fs-2"><span class="path1"></span><span class="path2"></span></i> Volver
          </button>
        </div>
      </div>
      <div class="card-body py-4">
        <div class="d-flex bg-light-warning rounded p-6">
          <i class="ki-duotone ki-information fs-2hx text-warning me-4"><span class="path1"></span><span class="path2"></span><span class="path3"></span></i>
          <div class="d-flex flex-column">
            <span class="fw-bold text-gray-800 fs-5">Próximamente</span>
            <span class="text-gray-700 fs-6 mt-1">
              Este formulario está en desarrollo. Aquí se gestionarán los cálculos complejos de ingredientes
              (costo unitario, rendimiento, costo base, etc.).
            </span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class IngredienteFormComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  isEdit = false;
  ingredientId: string | null = null;

  ngOnInit(): void {
    this.ingredientId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.ingredientId;
  }

  goBack(): void {
    this.router.navigate(['/cronos/ingredientes']);
  }
}
