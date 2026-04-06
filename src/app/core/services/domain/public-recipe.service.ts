import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse } from '../../models/api-response.model';
import { PublicSharedRecipeResponse } from '../../models/domain.model';

@Injectable({ providedIn: 'root' })
export class PublicRecipeService {
  private readonly API = environment.apiUrl + '/public/recipes/share';
  private http = inject(HttpClient);

  getSharedRecipe(token: string): Observable<ApiResponse<PublicSharedRecipeResponse>> {
    return this.http.get<ApiResponse<PublicSharedRecipeResponse>>(`${this.API}/${token}`);
  }
}
