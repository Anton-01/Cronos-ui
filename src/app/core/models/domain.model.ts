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

export interface AllergenResponse {
  id: string;
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
  id: string;
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

// Recetas
export interface CreateRecipeRequest {
  name: string;
  description?: string;
  categoryId?: string;
  yieldQuantity: number;
  yieldUnit: string;
  preparationTimeMinutes?: number;
  bakingTimeMinutes?: number;
  coolingTimeMinutes?: number;
  instructions?: string;
  storageInstructions?: string;
  shelfLifeDays?: number;
}

export interface RecipeResponse {
  id: string;
  name: string;
  description: string;
  yieldQuantity: number;
  yieldUnit: string;
  status: 'DRAFT' | 'ACTIVE';
  isActive: boolean;
  needsRecalculation: boolean;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeDetailResponse {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  yieldQuantity: number;
  yieldUnit: string;
  preparationTimeMinutes: number | null;
  bakingTimeMinutes: number | null;
  coolingTimeMinutes: number | null;
  instructions: string | null;
  storageInstructions: string | null;
  shelfLifeDays: number | null;
  status: 'DRAFT' | 'ACTIVE';
  isActive: boolean;
  needsRecalculation: boolean;
  currentVersion: number;
  ingredients: RecipeIngredientResponse[];
  fixedCosts: RecipeFixedCostResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredientRequest {
  rawMaterialId: string;
  quantity: number;
  unitId: string;
  displayOrder?: number;
  isOptional?: boolean;
  notes?: string;
}

export interface RecipeIngredientResponse {
  id: string;
  rawMaterialId: string;
  rawMaterialName: string;
  quantity: number;
  unitId: string;
  unitName: string;
  displayOrder: number;
  isOptional: boolean;
  notes: string | null;
  hasAllergen: boolean;
  allergenNames: string[];
}

export interface SubstituteIngredientRequest {
  substituteMaterialId: string;
}

export interface RecipeFixedCostRequest {
  userFixedCostId: string;
  timeInMinutes?: number;
  percentage?: number;
}

export interface RecipeFixedCostResponse {
  id: string;
  userFixedCostId: string;
  userFixedCostName: string;
  calculationMethod: string;
  defaultAmount: number;
  timeInMinutes: number | null;
  percentage: number | null;
  calculatedCost: number;
}

export interface RecipeCostBreakdown {
  targetYield: number;
  yieldUnit: string;
  scaleFactor: number;
  materialsCost: number;
  subRecipesCost: number;
  fixedCosts: number;
  totalCost: number;
  costPerUnit: number;
}

// Archivos de Receta
export interface RecipeFileResponse {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  sizeBytes: number;
  description: string | null;
  isPrimary: boolean;
  createdAt: string;
}

// Compartir Receta
export interface CreateRecipeShareRequest {
  expirationDays: number;
  recipientEmail?: string;
}

export interface RecipeShareResponse {
  id: string;
  shareUrl: string;
  expiresAt: string;
  viewsCount: number;
  isRevoked: boolean;
  createdAt: string;
}

export interface RecipeShareAccessLogResponse {
  id: string;
  accessedAt: string;
  ipAddress: string;
  userAgent: string;
}

// Receta Compartida Pública
export interface PublicSharedRecipeResponse {
  recipeName: string;
  description: string | null;
  instructions: string | null;
  storageInstructions: string | null;
  owner: {
    fullName: string;
    brandName: string | null;
  };
  expiresAt: string;
  ingredients: PublicRecipeIngredient[];
  files: PublicRecipeFile[];
}

export interface PublicRecipeIngredient {
  name: string;
  quantity: number;
  unitName: string;
  isOptional: boolean;
}

export interface PublicRecipeFile {
  url: string;
  fileType: string;
  description: string | null;
}

// Costos Fijos del Usuario
export interface UserFixedCostRequest {
  name: string;
  description?: string;
  type: string;
  defaultAmount: number;
  calculationMethod: string;
}

export interface UserFixedCostResponse {
  id: string;
  name: string;
  description: string | null;
  type: string;
  defaultAmount: number;
  calculationMethod: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Cotizaciones (Quotes) ───

export interface QuoteItemRequest {
  recipeId?: string;
  productName: string;
  productDescription?: string;
  productSize?: string;
  quantity: number;
  unitCost: number;
  profitPercentage: number;
  unitPrice: number;
  notes?: string;
}

export interface CreateQuoteRequest {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  notes?: string;
  taxRate: number;
  currency: string;
  validDays: number;
  items: QuoteItemRequest[];
}

export interface InternalQuoteResponse {
  id: string;
  quoteNumber: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  total: number;
  currency: string;
  status: string;
  createdAt: string;
  publicToken: string;
}

export interface PublicQuoteItemResponse {
  productName: string;
  productDescription: string | null;
  productSize: string | null;
  mainImageUrl: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface PublicQuoteResponse {
  quoteNumber: string;
  bakerName: string;
  clientName: string;
  notes: string | null;
  quoteDate: string;
  validUntil: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  status: string;
  isExpired: boolean;
  items: PublicQuoteItemResponse[];
}

// Receta simplificada para el buscador de cotizaciones
export interface RecipeSimpleResponse {
  id: string;
  name: string;
  description: string | null;
  totalCost: number;
  costPerUnit?: number;
  yieldUnit: string;
}
