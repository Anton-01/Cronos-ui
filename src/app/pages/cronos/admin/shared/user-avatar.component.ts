import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AvatarModule } from 'primeng/avatar';

import { initialsOf } from './iam-labels';

/** Profile picture with an initials fallback, at one of three sizes. */
@Component({
  selector: 'app-user-avatar',
  standalone: true,
  imports: [AvatarModule],
  template: `
    @if (avatarUrl(); as url) {
      <p-avatar [image]="url" shape="circle" [size]="primeSize()" [styleClass]="'iam-avatar iam-avatar-' + size()" [ariaLabel]="displayName()" />
    } @else {
      <p-avatar [label]="initials()" shape="circle" [size]="primeSize()" [styleClass]="'iam-avatar iam-avatar-initials iam-avatar-' + size()" [ariaLabel]="displayName()" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAvatarComponent {
  readonly avatarUrl = input<string | null>(null);
  readonly firstName = input<string | null>(null);
  readonly lastName = input<string | null>(null);
  readonly displayName = input('');
  readonly size = input<'sm' | 'md' | 'xl'>('sm');

  protected readonly initials = computed(() => initialsOf(this.firstName(), this.lastName(), this.displayName()));
  protected readonly primeSize = computed(() => (this.size() === 'sm' ? undefined : this.size() === 'md' ? 'large' : 'xlarge'));
}
