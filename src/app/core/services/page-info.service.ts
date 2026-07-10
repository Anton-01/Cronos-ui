import { Injectable, signal } from '@angular/core';

export interface PageLink {
  title: string;
  path: string;
  isActive: boolean;
  isSeparator?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PageInfoService {
  readonly title = signal<string>('Dashboard');
  readonly description = signal<string>('');
  readonly breadcrumbs = signal<PageLink[]>([]);

  setTitle(title: string): void {
    this.title.set(title);
  }

  updateTitle(title: string): void {
    // Deferred to avoid ExpressionChangedAfterItHasBeenChecked when called from ngOnInit
    setTimeout(() => this.setTitle(title), 1);
  }

  setDescription(description: string): void {
    this.description.set(description);
  }

  updateDescription(description: string): void {
    setTimeout(() => this.setDescription(description), 1);
  }

  setBreadcrumbs(breadcrumbs: PageLink[]): void {
    this.breadcrumbs.set(breadcrumbs);
  }

  updateBreadcrumbs(breadcrumbs: PageLink[]): void {
    setTimeout(() => this.setBreadcrumbs(breadcrumbs), 1);
  }
}
