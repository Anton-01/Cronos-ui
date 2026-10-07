import { AllergenRef, RecipeConfiguration } from './kitchen.models';

// Categorías — see ./category.model.ts (typed by CategoryType + CategoryScope).
export * from './category.model';

// Tipos de Unidad y Unidades de Medida — ver ./unit-catalog.models.ts
export * from './unit-catalog.models';

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
  defaultAmount?: number;
  percentage?: number;
  calculationMethod: string;
}

export interface UserFixedCostResponse {
  id: string;
  name: string;
  description: string | null;
  type: string;
  defaultAmount: number;
  percentage: number | null;
  calculationMethod: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Cotizaciones (Quotes) ───

export interface QuoteItemRequest {
  recipeId?: string;
  /** Which selectable lines go in / are swapped (doc kitchen §6). Server re-prices it; `unitCost` is informative. */
  recipeConfiguration?: RecipeConfiguration | null;
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
  deliveryFee?: number;
  extraFee?: number;
  extraFeeDescription?: string;
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

// Item returned inside a QuoteDetailResponse (edit view)
export interface QuoteItemDetailResponse {
  id?: string;
  recipeId?: string | null;
  recipeConfiguration?: RecipeConfiguration | null;
  allergens?: AllergenRef[];
  productName: string;
  productDescription?: string | null;
  productSize?: string | null;
  quantity: number;
  unitCost: number;
  profitPercentage: number;
  unitPrice: number;
  subtotal?: number;
  notes?: string | null;
}

// Full payload returned by GET /api/v1/quotes/{id} for the edit view.
// Contains every field needed to rehydrate the quote form.
export interface QuoteDetailResponse {
  id: string;
  quoteNumber: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  notes: string | null;
  taxRate: number;
  currency: string;
  validDays: number;
  deliveryFee: number;
  extraFee: number;
  extraFeeDescription: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: string;
  createdAt: string;
  publicToken: string;
  items: QuoteItemDetailResponse[];
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
  deliveryFee: number;
  extraFee: number;
  extraFeeDescription?: string | null;
  total: number;
  currency: string;
  status: string;
  isExpired: boolean;
  items: PublicQuoteItemResponse[];
}

// ─── Dashboard de Detalles de Cotización ───

export interface QuoteAccessLogResponse {
  ipAddress: string;
  browserInfo: string;
  accessedAt: Date;
}

export interface InternalQuoteItemResponse {
  id: string;
  recipeId: string | null;
  productName: string;
  productDescription: string | null;
  productSize: string | null;
  quantity: number;
  unitCost: number;
  profitPercentage: number;
  unitPrice: number;
  subtotal: number;
  notes: string | null;
}

export interface BakerQuoteDetailResponse {
  id: string;
  quoteNumber: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  status: string;
  createdAt: Date;
  validUntil: Date;
  subtotal: number;
  taxAmount: number;
  deliveryFee: number;
  extraFee: number;
  totalRevenue: number;
  totalProductCost: number;
  estimatedProfit: number;
  viewsCount: number;
  isRevoked: boolean;
  publicToken: string;
  items: InternalQuoteItemResponse[];
  accessLogs: QuoteAccessLogResponse[];
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
