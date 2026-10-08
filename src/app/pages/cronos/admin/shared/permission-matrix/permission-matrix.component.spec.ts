import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { PermissionDefinition } from 'src/app/core/models/iam.models';
import { PermissionMatrixComponent } from './permission-matrix.component';

function permission(code: string, dependsOn: string[] = []): PermissionDefinition {
  const [module, resource, action] = code.split('.');
  return {
    code,
    module,
    resource,
    action,
    moduleName: module,
    resourceName: resource,
    name: action,
    description: '',
    risk: 'LOW',
    dependsOn,
  };
}

const CATALOG: PermissionDefinition[] = [
  permission('IAM.USER.READ'),
  permission('IAM.USER.UPDATE', ['IAM.USER.READ']),
  permission('IAM.USER.MANAGE_ACCESS', ['IAM.USER.UPDATE']),
  permission('IAM.ROLE.READ'),
];

describe('PermissionMatrixComponent', () => {
  let fixture: ComponentFixture<PermissionMatrixComponent>;
  let component: PermissionMatrixComponent;

  const toggle = (code: string) => component['toggleCell'](CATALOG.find((p) => p.code === code)!);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PermissionMatrixComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService({})],
    });
    fixture = TestBed.createComponent(PermissionMatrixComponent);
    fixture.componentRef.setInput('catalog', CATALOG);
    component = fixture.componentInstance;
  });

  it('grants the whole dependency closure when a permission is selected', () => {
    toggle('IAM.USER.MANAGE_ACCESS');

    expect([...component.granted()].sort()).toEqual(['IAM.USER.MANAGE_ACCESS', 'IAM.USER.READ', 'IAM.USER.UPDATE']);
    expect(component['cascadeNotice']()?.codes.sort()).toEqual(['IAM.USER.READ', 'IAM.USER.UPDATE']);
  });

  it('revokes every dependent permission when a prerequisite is cleared', () => {
    component.granted.set(['IAM.USER.READ', 'IAM.USER.UPDATE', 'IAM.USER.MANAGE_ACCESS', 'IAM.ROLE.READ']);

    toggle('IAM.USER.READ');

    expect(component.granted()).toEqual(['IAM.ROLE.READ']);
  });

  it('does not re-grant a permission already inherited from a role or group', () => {
    fixture.componentRef.setInput('inherited', new Map([['IAM.USER.READ', 'Role: Viewer']]));

    toggle('IAM.USER.UPDATE');

    expect(component.granted()).toEqual(['IAM.USER.UPDATE']);
  });

  it('cycles none → granted → denied → none in grant-deny mode', () => {
    fixture.componentRef.setInput('mode', 'grant-deny');

    toggle('IAM.ROLE.READ');
    expect(component['stateOf']('IAM.ROLE.READ')).toBe('granted');

    toggle('IAM.ROLE.READ');
    expect(component['stateOf']('IAM.ROLE.READ')).toBe('denied');
    expect(component.granted()).not.toContain('IAM.ROLE.READ');

    toggle('IAM.ROLE.READ');
    expect(component['stateOf']('IAM.ROLE.READ')).toBe('none');
  });

  it('lets an inherited permission be explicitly denied', () => {
    fixture.componentRef.setInput('mode', 'grant-deny');
    fixture.componentRef.setInput('inherited', new Map([['IAM.ROLE.READ', 'Role: Viewer']]));

    toggle('IAM.ROLE.READ');

    expect(component.denied()).toEqual(['IAM.ROLE.READ']);
    expect(component['effectiveCount']()).toBe(0);
  });

  it('ignores clicks when read-only', () => {
    fixture.componentRef.setInput('readonly', true);

    toggle('IAM.ROLE.READ');

    expect(component.granted()).toEqual([]);
  });
});
