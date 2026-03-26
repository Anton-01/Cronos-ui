import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse } from '../../models/api-response.model';
import { Page, PageRequest } from '../../models/pagination.model';
import {
  RecipeResponse,
  RecipeDetailResponse,
  CreateRecipeRequest,
  RecipeIngredientRequest,
  RecipeIngredientResponse,
  SubstituteIngredientRequest,
  RecipeFixedCostRequest,
  RecipeFixedCostResponse,
  RecipeCostBreakdown,
} from '../../models/domain.model';

@Injectable({ providedIn: 'root' })
export class RecipeService {
  private readonly API = environment.apiUrl + '/recipes';
  private http = inject(HttpClient);

  getAll(params: PageRequest, search?: string): Observable<ApiResponse<Page<RecipeResponse>>> {
    let httpParams = new HttpParams()
      .set('page', params.page.toString())
      .set('size', params.size.toString())
      .set('sort', params.sort ?? 'name,asc');
    if (search) {
      httpParams = httpParams.set('search', search);
    }
    return this.http.get<ApiResponse<Page<RecipeResponse>>>(this.API, { params: httpParams });
  }

  getById(id: string): Observable<ApiResponse<RecipeDetailResponse>> {
    return this.http.get<ApiResponse<RecipeDetailResponse>>(`${this.API}/${id}`);
  }

  create(req: CreateRecipeRequest): Observable<ApiResponse<RecipeResponse>> {
    return this.http.post<ApiResponse<RecipeResponse>>(this.API, req);
  }

  update(id: string, req: CreateRecipeRequest): Observable<ApiResponse<RecipeResponse>> {
    return this.http.put<ApiResponse<RecipeResponse>>(`${this.API}/${id}`, req);
  }

  delete(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.API}/${id}`);
  }

  // --- Ingredients ---
  addIngredient(recipeId: string, req: RecipeIngredientRequest): Observable<ApiResponse<RecipeIngredientResponse>> {
    return this.http.post<ApiResponse<RecipeIngredientResponse>>(`${this.API}/${recipeId}/ingredients`, req);
  }

  removeIngredient(recipeId: string, ingredientId: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.API}/${recipeId}/ingredients/${ingredientId}`);
  }

  substituteIngredient(
    recipeId: string,
    ingredientId: string,
    req: SubstituteIngredientRequest
  ): Observable<ApiResponse<RecipeIngredientResponse>> {
    return this.http.post<ApiResponse<RecipeIngredientResponse>>(
      `${this.API}/${recipeId}/ingredients/${ingredientId}/substitute`,
      req
    );
  }

  // --- Fixed Costs ---
  addFixedCost(recipeId: string, req: RecipeFixedCostRequest): Observable<ApiResponse<RecipeFixedCostResponse>> {
    return this.http.post<ApiResponse<RecipeFixedCostResponse>>(`${this.API}/${recipeId}/fixed-costs`, req);
  }

  removeFixedCost(recipeId: string, costId: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.API}/${recipeId}/fixed-costs/${costId}`);
  }

  // --- Cost Engine ---
  getCostBreakdown(recipeId: string, targetYield?: number): Observable<ApiResponse<RecipeCostBreakdown>> {
    let httpParams = new HttpParams();
    if (targetYield != null) {
      httpParams = httpParams.set('targetYield', targetYield.toString());
    }
    return this.http.get<ApiResponse<RecipeCostBreakdown>>(`${this.API}/${recipeId}/cost`, { params: httpParams });
  }
}
