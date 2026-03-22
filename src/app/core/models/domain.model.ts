// Categorías
export interface CategoryResponse {
  id: number;
  name: string;
  description: string | null;
  isSystemDefault: boolean;
  status: 'ACTIVE' | 'INACTIVE';
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
  alternativeName: string | null;
  description: string | null;
  isSystemDefault: boolean;
  status: 'ACTIVE' | 'INACTIVE';
}
export interface CreateAllergenRequest {
  name: string;
  alternativeName?: string;
  description?: string;
}
export interface UpdateAllergenRequest {
  id: number;
  name: string;
  alternativeName?: string;
  description?: string;
}

// Tipos de Unidad
export interface UnitTypeResponse {
  id: number;
  codeIdentity: string;
  name: string;
  dimension: string;
  status: 'ACTIVE' | 'INACTIVE';
}
export interface CreateUnitTypeRequest {
  codeIdentity: string;
  name: string;
  dimension: string;
}
export interface UpdateUnitTypeRequest {
  id: number;
  codeIdentity: string;
  name: string;
  dimension: string;
}

// Unidades de Medida
export interface MeasurementUnitResponse {
  id: number;
  codeIdentity: string;
  name: string;
  dimension: string;
  status: 'ACTIVE' | 'INACTIVE';
}
export interface CreateMeasurementUnitRequest {
  codeIdentity: string;
  name: string;
  dimension: string;
}
export interface UpdateMeasurementUnitRequest {
  id: number;
  codeIdentity: string;
  name: string;
  dimension: string;
}

// Ingredientes
export interface IngredientResponse {
  id: string;
  name: string;
  categoryName: string;
  purchaseUnitCode: string;
  purchaseQuantity: number;
  unitCost: number;
  yieldPercentage: number;
  baseUnitCost: number;
  status: 'ACTIVE' | 'INACTIVE';
}
export interface CreateIngredientRequest {
  name: string;
  categoryName?: string;
  purchaseUnitCode?: string;
  purchaseQuantity?: number;
  unitCost?: number;
  yieldPercentage?: number;
}
export interface UpdateIngredientRequest {
  id: string;
  name: string;
  categoryName?: string;
  purchaseUnitCode?: string;
  purchaseQuantity?: number;
  unitCost?: number;
  yieldPercentage?: number;
}
