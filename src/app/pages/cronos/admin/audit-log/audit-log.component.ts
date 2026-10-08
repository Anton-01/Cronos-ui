import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CardModule } from 'primeng/card';

import { PERMISSIONS } from 'src/app/core/constants/permissions';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AuditEventTableComponent } from '../shared/audit-event-table/audit-event-table.component';

/** Tenant-wide, append-only audit trail (doc §7). */
@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [TranslatePipe, CardModule, AuditEventTableComponent],
  template: `
    <p-card>
      <app-audit-event-table [showFilters]="true" [allowExport]="canExport()" [rows]="15" />
    </p-card>
    <p class="text-xs text-color-secondary mt-3 mb-0"><i class="pi pi-lock text-xs mr-1" aria-hidden="true"></i>{{ 'IAM.AUDIT.IMMUTABLE_HINT' | translate }}</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogComponent {
  private readonly authorization = inject(AuthorizationService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);

  protected readonly canExport = computed(() => this.authorization.can(PERMISSIONS.IAM_AUDIT_EXPORT));

  constructor() {
    effect(() => {
      this.pageInfo.updateTitle(this.language.t('IAM.AUDIT.TITLE'));
      this.pageInfo.updateDescription(this.language.t('IAM.AUDIT.DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('NAV.SECTIONS.ADMINISTRATION'), path: '', isActive: false },
        { title: this.language.t('IAM.AUDIT.TITLE'), path: '', isActive: true },
      ]);
    });
  }
}
