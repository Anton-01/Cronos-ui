import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { environment } from 'src/environments/environment';
import { ApiResponse, Page } from 'src/app/core/models';
import { CategoryResponse } from 'src/app/core/models/category.model';
import { CategoryListComponent } from './category-list.component';

/**
 * Guards the fix for a repeatedly-reported bug: a saved category not
 * appearing in the grid until a hard browser refresh. `onSaved()` used to
 * splice the dialog's row straight into `items`, trusting it matched the
 * route's `type` — that trust point kept failing for reasons a static read
 * never turned up, so it now refetches from the server instead.
 */
describe('CategoryListComponent', () => {
  let fixture: ComponentFixture<CategoryListComponent>;
  let component: CategoryListComponent;
  let httpMock: HttpTestingController;

  function pageOf(content: CategoryResponse[]): ApiResponse<Page<CategoryResponse>> {
    return {
      success: true,
      message: null,
      timestamp: '',
      data: {
        content,
        totalElements: content.length,
        totalPages: 1,
        size: 1000,
        number: 0,
        first: true,
        last: true,
        empty: content.length === 0,
      },
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryListComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService({}),
        MessageService,
        ConfirmationService,
        { provide: ActivatedRoute, useValue: { data: of({ type: 'INGREDIENT' }) } },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CategoryListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // The constructor's route-driven effect fires the initial fetch.
    httpMock.expectOne((req) => req.url === `${environment.apiUrl}/category`).flush(pageOf([]));
  });

  afterEach(() => httpMock.verify());

  it('refetches the grid after a save instead of trusting the dialog-returned row', () => {
    const saved: CategoryResponse = {
      id: 9,
      name: 'Azúcares y Edulcorantes',
      description: '',
      type: 'INGREDIENT',
      scope: 'USER',
      status: 'ACTIVE',
    };

    expect(component.items()).toEqual([]);

    component.onSaved();

    const req = httpMock.expectOne((r) => r.url === `${environment.apiUrl}/category`);
    expect(req.request.method).toBe('GET');
    req.flush(pageOf([saved]));

    expect(component.items()).toEqual([saved]);
  });

  it('closes the dialog immediately on save, without waiting for the refetch', () => {
    component.openCreate();
    expect(component.openDialog()).toBe('form');

    component.onSaved();
    expect(component.openDialog()).toBe('none');

    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/category`).flush(pageOf([]));
  });
});
