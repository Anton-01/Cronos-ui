// Categorías
export interface CategoryResponse {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CreateCategoryRequest {
  name: string;
  description?: string;
}
export interface UpdateCategoryRequest {
  id: number;
  name: string;
  description?: string;
}

// Alérgenos
export interface AllergenResponse {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CreateAllergenRequest {
  name: string;
  description?: string;
  icon?: string;
}
export interface UpdateAllergenRequest {
  id: number;
  name: string;
  description?: string;
  icon?: string;
}

// Tipos de Unidad
export interface UnitTypeResponse {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CreateUnitTypeRequest {
  name: string;
  description?: string;
}
export interface UpdateUnitTypeRequest {
  id: number;
  name: string;
  description?: string;
}

// Unidades de Medida
export interface MeasurementUnitResponse {
  id: number;
  name: string;
  abbreviation: string;
  unitType: UnitTypeResponse | null;
  createdAt: string;
  updatedAt: string;
}
export interface CreateMeasurementUnitRequest {
  name: string;
  abbreviation: string;
  unitTypeId?: number;
}
export interface UpdateMeasurementUnitRequest {
  id: number;
  name: string;
  abbreviation: string;
  unitTypeId?: number;
}

// Ingredientes
export interface IngredientResponse {
  id: number;
  name: string;
  description: string | null;
  category: CategoryResponse | null;
  measurementUnit: MeasurementUnitResponse | null;
  allergens: AllergenResponse[];
  createdAt: string;
  updatedAt: string;
}
export interface CreateIngredientRequest {
  name: string;
  description?: string;
  categoryId?: number;
  measurementUnitId?: number;
  allergenIds?: number[];
}
export interface UpdateIngredientRequest {
  id: number;
  name: string;
  description?: string;
  categoryId?: number;
  measurementUnitId?: number;
  allergenIds?: number[];
}
