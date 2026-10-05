import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { PermissionDefinition, PermissionRisk } from 'src/app/core/models/iam.models';
import { LanguageService } from 'src/app/core/services/language.service';
import { SelectOption } from 'src/app/shared/i18n/catalog-options';
import { RISK_ORDER, RISK_SEVERITY } from '../iam-labels';

/** What a cell shows. `inherited` = held through a role/group, not editable here. */
export type CellState = 'none' | 'granted' | 'denied' | 'inherited';

export type MatrixMode = 'grant' | 'grant-deny';

interface ResourceRow {
  resource: string;
  resourceName: string;
  permissions: PermissionDefinition[];
}

interface ModuleBlock {
  module: string;
  moduleName: string;
  resources: ResourceRow[];
  total: number;
}

const RISKS: readonly PermissionRisk[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * Granular permission picker shared by the role editor, the permission-group
 * editor and the user access panel.
 *
 * Layout: one accordion panel per module → one row per resource → one chip
 * per action. Bulk toggles exist at module and resource level.
 *
 * Invariants it maintains on `granted`:
 * - Selecting a permission also selects everything in its `dependsOn`
 *   closure (you cannot update a user you cannot read).
 * - Clearing a permission also clears every selected permission that
 *   depends on it.
 * Both cascades are announced in an inline message so nothing changes
 * silently.
 *
 * In `grant-deny` mode (user access) a cell cycles none → granted → denied
 * → none, and inherited cells can be explicitly denied.
 */
@Component({
  selector: 'app-permission-matrix',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    AccordionModule,
    ButtonModule,
    CheckboxModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    TagModule,
    ToggleSwitchModule,
    TooltipModule,
  ],
  templateUrl: './permission-matrix.component.html',
  styleUrl: './permission-matrix.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PermissionMatrixComponent {
  private readonly language = inject(LanguageService);

  readonly catalog = input.required<readonly PermissionDefinition[]>();
  readonly granted = model<readonly string[]>([]);
  readonly denied = model<readonly string[]>([]);
  /** code → human label of where it comes from ("Rol: Ventas"). */
  readonly inherited = input<ReadonlyMap<string, string>>(new Map());
  readonly mode = input<MatrixMode>('grant');
  readonly readonly = input(false);
  readonly loading = input(false);

  protected readonly riskSeverity = RISK_SEVERITY;
  protected readonly search = signal('');
  protected readonly riskFilter = signal<PermissionRisk[]>([]);
  protected readonly onlySelected = signal(false);
  protected readonly cascadeNotice = signal<{ key: string; codes: string[] } | null>(null);
  private readonly expandedOverride = signal<string[] | null>(null);

  protected readonly riskOptions = computed<SelectOption<PermissionRisk>[]>(() =>
    RISKS.map((value) => ({ value, label: this.language.t(`IAM.RISK.${value}`) })),
  );

  private readonly grantedSet = computed(() => new Set(this.granted()));
  private readonly deniedSet = computed(() => new Set(this.denied()));
  private readonly byCode = computed(() => new Map(this.catalog().map((p) => [p.code, p])));

  /** Reverse dependency index: code → codes that list it in `dependsOn`. */
  private readonly dependents = computed(() => {
    const index = new Map<string, string[]>();
    for (const permission of this.catalog()) {
      for (const dependency of permission.dependsOn) {
        index.set(dependency, [...(index.get(dependency) ?? []), permission.code]);
      }
    }
    return index;
  });

  private readonly modules = computed<ModuleBlock[]>(() => {
    const blocks = new Map<string, ModuleBlock>();
    for (const permission of this.catalog()) {
      let block = blocks.get(permission.module);
      if (!block) {
        block = { module: permission.module, moduleName: permission.moduleName, resources: [], total: 0 };
        blocks.set(permission.module, block);
      }
      let row = block.resources.find((r) => r.resource === permission.resource);
      if (!row) {
        row = { resource: permission.resource, resourceName: permission.resourceName, permissions: [] };
        block.resources.push(row);
      }
      row.permissions.push(permission);
      block.total++;
    }
    return [...blocks.values()];
  });

  protected readonly visibleModules = computed<ModuleBlock[]>(() => {
    const term = this.search().trim().toLowerCase();
    const risks = new Set(this.riskFilter());
    const onlySelected = this.onlySelected();

    const matches = (p: PermissionDefinition): boolean =>
      (!term ||
        p.name.toLowerCase().includes(term) ||
        p.code.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term) ||
        p.resourceName.toLowerCase().includes(term) ||
        p.moduleName.toLowerCase().includes(term)) &&
      (risks.size === 0 || risks.has(p.risk)) &&
      (!onlySelected || this.stateOf(p.code) !== 'none');

    return this.modules()
      .map((block) => {
        const resources = block.resources
          .map((row) => ({ ...row, permissions: row.permissions.filter(matches) }))
          .filter((row) => row.permissions.length > 0);
        return { ...block, resources, total: resources.reduce((sum, row) => sum + row.permissions.length, 0) };
      })
      .filter((block) => block.resources.length > 0);
  });

  /** Filtering opens every matching module; otherwise the user's own choice (default: all closed). */
  protected readonly expanded = computed<string[]>(() => {
    const filtering = this.search().trim().length > 0 || this.riskFilter().length > 0 || this.onlySelected();
    if (filtering) {
      return this.visibleModules().map((block) => block.module);
    }
    return this.expandedOverride() ?? [];
  });

  protected readonly effectiveCount = computed(() => {
    const denied = this.deniedSet();
    const codes = new Set([...this.granted(), ...this.inherited().keys()]);
    return [...codes].filter((code) => !denied.has(code)).length;
  });

  protected readonly highestRisk = computed<PermissionRisk | null>(() => {
    let highest: PermissionRisk | null = null;
    const denied = this.deniedSet();
    for (const code of [...this.granted(), ...this.inherited().keys()]) {
      const risk = this.byCode().get(code)?.risk;
      if (risk && !denied.has(code) && (highest === null || RISK_ORDER[risk] > RISK_ORDER[highest])) {
        highest = risk;
      }
    }
    return highest;
  });

  // ─── Cell state ───

  protected stateOf(code: string): CellState {
    if (this.deniedSet().has(code)) {
      return 'denied';
    }
    if (this.grantedSet().has(code)) {
      return 'granted';
    }
    return this.inherited().has(code) ? 'inherited' : 'none';
  }

  protected inheritedFrom(code: string): string | null {
    return this.inherited().get(code) ?? null;
  }

  protected selectedInModule(block: ModuleBlock): number {
    return block.resources.reduce((sum, row) => sum + this.selectedInRow(row), 0);
  }

  protected selectedInRow(row: ResourceRow): number {
    return row.permissions.filter((p) => {
      const state = this.stateOf(p.code);
      return state === 'granted' || state === 'inherited';
    }).length;
  }

  protected allGranted(permissions: PermissionDefinition[]): boolean {
    return permissions.length > 0 && permissions.every((p) => this.stateOf(p.code) !== 'none' && this.stateOf(p.code) !== 'denied');
  }

  protected someGranted(permissions: PermissionDefinition[]): boolean {
    const count = permissions.filter((p) => this.grantedSet().has(p.code)).length;
    return count > 0 && !this.allGranted(permissions);
  }

  protected modulePermissions(block: ModuleBlock): PermissionDefinition[] {
    return block.resources.flatMap((row) => row.permissions);
  }

  // ─── Interaction ───

  protected toggleCell(permission: PermissionDefinition): void {
    if (this.readonly()) {
      return;
    }
    const state = this.stateOf(permission.code);
    if (this.mode() === 'grant') {
      if (state === 'granted') {
        this.revoke([permission.code]);
      } else if (state === 'none') {
        this.grant([permission.code]);
      }
      return;
    }
    // grant-deny: none → granted → denied → none ; inherited → denied → inherited
    switch (state) {
      case 'none':
        this.grant([permission.code]);
        break;
      case 'granted':
        this.revoke([permission.code]);
        this.deny([permission.code]);
        break;
      case 'inherited':
        this.deny([permission.code]);
        break;
      case 'denied':
        this.denied.set(this.denied().filter((code) => code !== permission.code));
        break;
    }
  }

  protected toggleMany(permissions: PermissionDefinition[], checked: boolean): void {
    if (this.readonly()) {
      return;
    }
    const codes = permissions.map((p) => p.code).filter((code) => !this.inherited().has(code));
    if (checked) {
      this.grant(codes);
    } else {
      this.revoke(codes);
    }
  }

  protected clearAll(): void {
    if (this.readonly()) {
      return;
    }
    this.granted.set([]);
    this.denied.set([]);
    this.cascadeNotice.set(null);
  }

  protected onExpandedChange(value: unknown): void {
    if (Array.isArray(value)) {
      this.expandedOverride.set(value.filter((item): item is string => typeof item === 'string'));
    }
  }

  protected expandAll(): void {
    this.expandedOverride.set(this.modules().map((block) => block.module));
  }

  protected collapseAll(): void {
    this.expandedOverride.set([]);
  }

  protected labelOf(code: string): string {
    return this.byCode().get(code)?.name ?? code;
  }

  protected cellAriaLabel(permission: PermissionDefinition): string {
    return `${permission.resourceName} · ${permission.name} — ${this.language.t(`IAM.MATRIX.STATE.${this.stateOf(permission.code).toUpperCase()}`)}`;
  }

  private grant(codes: string[]): void {
    const current = new Set(this.granted());
    const requested = new Set(codes);
    const closure = this.dependencyClosure(codes);
    const added: string[] = [];
    for (const code of closure) {
      if (!current.has(code) && !this.inherited().has(code)) {
        current.add(code);
        if (!requested.has(code)) {
          added.push(code);
        }
      }
    }
    this.granted.set([...current]);
    // A grant always lifts an explicit denial on the same codes.
    if (this.denied().length > 0) {
      this.denied.set(this.denied().filter((code) => !closure.has(code)));
    }
    this.cascadeNotice.set(added.length > 0 ? { key: 'IAM.MATRIX.CASCADE_ADDED', codes: added } : null);
  }

  private revoke(codes: string[]): void {
    const requested = new Set(codes);
    const closure = this.dependentClosure(codes);
    const removed = [...closure].filter((code) => !requested.has(code) && this.grantedSet().has(code));
    this.granted.set(this.granted().filter((code) => !closure.has(code)));
    this.cascadeNotice.set(removed.length > 0 ? { key: 'IAM.MATRIX.CASCADE_REMOVED', codes: removed } : null);
  }

  private deny(codes: string[]): void {
    const next = new Set(this.denied());
    for (const code of codes) {
      next.add(code);
    }
    this.denied.set([...next]);
  }

  private dependencyClosure(codes: string[]): Set<string> {
    const result = new Set<string>();
    const stack = [...codes];
    while (stack.length > 0) {
      const code = stack.pop()!;
      if (result.has(code)) {
        continue;
      }
      result.add(code);
      stack.push(...(this.byCode().get(code)?.dependsOn ?? []));
    }
    return result;
  }

  private dependentClosure(codes: string[]): Set<string> {
    const result = new Set<string>();
    const stack = [...codes];
    while (stack.length > 0) {
      const code = stack.pop()!;
      if (result.has(code)) {
        continue;
      }
      result.add(code);
      stack.push(...(this.dependents().get(code) ?? []));
    }
    return result;
  }
}
