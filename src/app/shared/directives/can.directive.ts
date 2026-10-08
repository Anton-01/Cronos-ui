import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';

import { AuthorizationService } from 'src/app/core/services/authorization.service';

/**
 * Renders its template only when the signed-in user holds the permission
 * (or any of the permissions, when given a list).
 *
 * ```html
 * <p-button *appCan="perms.IAM_USER_CREATE" … />
 * <section *appCan="[perms.IAM_ROLE_UPDATE, perms.IAM_ROLE_CREATE]">…</section>
 * ```
 */
@Directive({
  selector: '[appCan]',
  standalone: true,
})
export class CanDirective {
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private readonly authorization = inject(AuthorizationService);

  readonly appCan = input.required<string | readonly string[]>();

  private rendered = false;

  constructor() {
    effect(() => {
      const required = this.appCan();
      const allowed = this.authorization.canAny(typeof required === 'string' ? [required] : required);
      if (allowed && !this.rendered) {
        this.container.createEmbeddedView(this.template);
        this.rendered = true;
      } else if (!allowed && this.rendered) {
        this.container.clear();
        this.rendered = false;
      }
    });
  }
}
