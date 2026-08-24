import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpInterceptorFn, provideHttpClient, withInterceptors } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { environment } from 'src/environments/environment';
import { CategoryResponse } from 'src/app/core/models/category.model';
import { CategoryFormDialogComponent } from './category-form-dialog.component';

/**
 * Reproduces the one contract `ErrorInterceptorService` gives every component:
 * failures arrive already unwrapped to the API envelope, not as an
 * `HttpErrorResponse`. `apiErrors()` reads `errors[]` off that envelope, so
 * without this the dialog would never see a field-scoped rejection — the real
 * interceptor is not used here because it drags in Router, AuthService and
 * TokenService for behaviour this dialog does not exercise.
 */
const unwrapApiEnvelope: HttpInterceptorFn = (req, next) =>
  next(req).pipe(catchError((error: HttpErrorResponse) => throwError(() => error.error ?? error)));

/**
 * Guards the two data-integrity bugs this dialog was fixed for: a `type` the
 * user could change, and a submit button that never reached the network.
 */
describe('CategoryFormDialogComponent', () => {
  let fixture: ComponentFixture<CategoryFormDialogComponent>;
  let component: CategoryFormDialogComponent;
  let httpMock: HttpTestingController;

  /** Mount in create mode, scoped to the Ingredient Categories route. */
  function mountAsIngredientCreate(): void {
    fixture = TestBed.createComponent(CategoryFormDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('type', 'INGREDIENT');
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryFormDialogComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(withInterceptors([unwrapApiEnvelope])),
        provideHttpClientTesting(),
        provideTranslateService({}),
        MessageService,
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('pre-fills `type` from the active route and locks the control', () => {
    mountAsIngredientCreate();

    const typeControl = component.form.controls.type;
    expect(typeControl.value).toBe('INGREDIENT');
    expect(typeControl.disabled).toBeTrue();
  });

  it('keeps `type` disabled after a reset, so it survives re-opening', () => {
    mountAsIngredientCreate();

    component.form.reset({ name: '', description: '', type: 'INGREDIENT' });

    expect(component.form.controls.type.disabled).toBeTrue();
    // `value` drops disabled controls; `getRawValue()` is what the submit reads.
    expect(component.form.value.type).toBeUndefined();
    expect(component.form.getRawValue().type).toBe('INGREDIENT');
  });

  it('POSTs the route-scoped type on create, and emits the saved row', () => {
    mountAsIngredientCreate();
    component.form.controls.name.setValue('Harinas');
    component.form.controls.description.setValue('  Trigo y centeno  ');

    const saved: CategoryResponse[] = [];
    component.saved.subscribe((row) => saved.push(row));

    component.saveCategory();

    const req = httpMock.expectOne(`${environment.apiUrl}/category`);
    expect(req.request.method).toBe('POST');
    // The disabled control still reaches the wire — the `getRawValue()` fix.
    expect(req.request.body).toEqual({
      name: 'Harinas',
      description: 'Trigo y centeno',
      type: 'INGREDIENT',
    });
    expect(component.isSaving()).toBeTrue();

    const row: CategoryResponse = {
      id: 7,
      name: 'Harinas',
      description: 'Trigo y centeno',
      type: 'INGREDIENT',
      scope: 'USER',
      status: 'ACTIVE',
    };
    req.flush({ success: true, message: null, data: row, timestamp: '' });

    expect(component.isSaving()).toBeFalse();
    expect(saved).toEqual([row]);
  });

  it('does not call the API while the form is invalid', () => {
    mountAsIngredientCreate();
    component.form.controls.name.setValue('');

    component.saveCategory();

    httpMock.expectNone(`${environment.apiUrl}/category`);
    expect(component.form.controls.name.touched).toBeTrue();
  });

  it('PUTs without `type` when editing, since the backend fixes it at creation', () => {
    fixture = TestBed.createComponent(CategoryFormDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('type', 'INGREDIENT');
    fixture.componentRef.setInput('category', {
      id: 12,
      name: 'Lácteos',
      description: null,
      type: 'INGREDIENT',
      scope: 'USER',
      status: 'ACTIVE',
    } satisfies CategoryResponse);
    fixture.detectChanges();

    component.form.controls.name.setValue('Lácteos y derivados');
    component.saveCategory();

    const req = httpMock.expectOne(`${environment.apiUrl}/category/12`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Lácteos y derivados', description: undefined });

    req.flush({ success: true, message: null, data: null, timestamp: '' });
  });

  it('clears the saving state when the backend rejects the write', () => {
    mountAsIngredientCreate();
    component.form.controls.name.setValue('Harinas');

    component.saveCategory();
    expect(component.isSaving()).toBeTrue();

    httpMock
      .expectOne(`${environment.apiUrl}/category`)
      .flush({ errors: [{ code: 'DUPLICATE_RESOURCE', message: 'already exists' }] }, { status: 409, statusText: 'Conflict' });

    expect(component.isSaving()).toBeFalse();
    expect(component.form.controls.name.hasError('duplicate')).toBeTrue();
  });
});
