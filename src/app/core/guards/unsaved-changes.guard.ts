import { CanDeactivateFn } from '@angular/router';

/** A routed component that may hold edits the user has not saved. */
export interface HasUnsavedChanges {
  /** Resolve `true` to allow leaving — typically after asking the user. */
  canDeactivate(): boolean | Promise<boolean>;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => component.canDeactivate();
