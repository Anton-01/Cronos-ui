import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';

import { UnitCatalogImportWizardComponent } from './unit-catalog-import-wizard.component';
import { ImportReport } from 'src/app/core/models/unit-catalog.models';

function baseReport(status: ImportReport['status']): ImportReport {
  return {
    batchId: 'b-1',
    resource: 'UNIT_TYPE',
    status,
    dryRun: status !== 'COMMITTED',
    fileName: 'unit-types.xlsx',
    fileSizeBytes: 1024,
    fileSha256: 'abc',
    totalRows: 3,
    created: 2,
    updated: 1,
    unchanged: 0,
    rejectedRows: 0,
    errorCount: 0,
    warningCount: 0,
    issuesTruncated: false,
    issues: [],
    rows: [],
    actorUsername: 'tester',
    traceId: null,
    startedAt: '2026-10-04T00:00:00.000Z',
    finishedAt: '2026-10-04T00:00:01.000Z',
    durationMs: 1000,
  };
}

describe('UnitCatalogImportWizardComponent', () => {
  let fixture: ComponentFixture<UnitCatalogImportWizardComponent>;
  let component: UnitCatalogImportWizardComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UnitCatalogImportWizardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService({}),
        provideRouter([]),
        MessageService,
        ConfirmationService,
      ],
    });
    fixture = TestBed.createComponent(UnitCatalogImportWizardComponent);
    fixture.componentRef.setInput('resource', 'UNIT_TYPE');
    component = fixture.componentInstance;
  });

  it('does not allow applying when the report has no file selected yet', () => {
    component.report.set(baseReport('VALIDATED'));
    expect(component.canApply()).toBeFalse();
  });

  it('blocks applying when the dry-run validation was REJECTED, even with a file selected', () => {
    component.selectedFile.set(new File(['x'], 'unit-types.xlsx'));
    component.report.set(baseReport('REJECTED'));

    expect(component.isRejected()).toBeTrue();
    expect(component.canApply()).toBeFalse();
  });

  it('allows applying only once the report is VALIDATED and a file is selected', () => {
    component.selectedFile.set(new File(['x'], 'unit-types.xlsx'));
    component.report.set(baseReport('VALIDATED'));

    expect(component.canApply()).toBeTrue();
  });

  it('confirmApply is a no-op against a REJECTED report (no confirmation dialog, no request)', async () => {
    component.selectedFile.set(new File(['x'], 'unit-types.xlsx'));
    component.report.set(baseReport('REJECTED'));

    await component.confirmApply();

    expect(component.isApplying()).toBeFalse();
    expect(component.activeStep()).toBe(0);
  });
});
