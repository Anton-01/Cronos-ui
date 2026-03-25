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
  namePlural: string;
  unitType: string;
  multiplierToBase: number;
  isBaseUnit: boolean;
  status: 'ACTIVE' | 'INACTIVE';
}
export interface CreateMeasurementUnitRequest {
  codeIdentity: string;
  name: string;
  namePlural: string;
  unitType: string;
  multiplierToBase: number;
  isBaseUnit: boolean;
}
export interface UpdateMeasurementUnitRequest {
  id: number;
  codeIdentity: string;
  name: string;
  namePlural: string;
  unitType: string;
  multiplierToBase: number;
  isBaseUnit: boolean;
}

// Ingredientes (List)
export interface IngredientResponse {
  id: string;
  name: string;
  categoryName: string;
  purchaseUnitCode: string;
  purchaseQuantity: number;
  unitCost: number;
  currency: string;
  yieldPercentage: number;
  baseUnitCost: number;
  status: 'ACTIVE' | 'INACTIVE';
}

// Ingredientes (Detail for edit)
export interface IngredientDetailResponse {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  supplier: string | null;
  categoryId: number;
  categoryName: string;
  purchaseUnitId: number;
  purchaseUnitCode: string;
  purchaseQuantity: number;
  unitCost: number;
  currency: string;
  yieldPercentage: number;
  baseUnitCost: number;
  minimumStock: number | null;
  densityConversion: DensityConversion | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface DensityConversion {
  gramsPerCup: number;
  gramsPerTablespoon?: number;
  gramsPerTeaspoon?: number;
}

export interface CreateIngredientRequest {
  name: string;
  description?: string;
  brand?: string;
  supplier?: string;
  categoryId: number;
  purchaseUnitId: number;
  purchaseQuantity: number;
  unitCost: number;
  currency: string;
  yieldPercentage: number;
  minimumStock?: number;
  densityConversion?: DensityConversion;
}

export interface UpdateIngredientRequest {
  id: string;
  name: string;
  description?: string;
  brand?: string;
  supplier?: string;
  categoryId: number;
  purchaseUnitId: number;
  purchaseQuantity: number;
  unitCost: number;
  currency: string;
  yieldPercentage: number;
  minimumStock?: number;
  densityConversion?: DensityConversion;
}
