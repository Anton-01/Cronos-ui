import { ChangeDetectorRef, Component, inject, effect } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import {SharedModule} from "../../../../../_metronic/shared/shared.module";
import {ProfileStateService} from "../../../../../core/services/profile/ProfileStateService";

@Component({
  selector: 'app-sign-in-method',
  templateUrl: './sign-in-method.component.html',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SharedModule],
})
export class SignInMethodComponent {
  public profileState = inject(ProfileStateService);
  private fb = inject(FormBuilder);

  showChangeEmailForm: boolean = false;
  showChangePasswordForm: boolean = false;
  isLoading$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  isLoading: boolean;
  private unsubscribe: Subscription[] = [];

  formEmail = this.fb.group({
    email: ['']
  });

  constructor(private cdr: ChangeDetectorRef) {
    const loadingSubscr = this.isLoading$
      .asObservable()
      .subscribe((res) => (this.isLoading = res));
    this.unsubscribe.push(loadingSubscr);

    effect(() => {
      const currentUser = this.profileState.user();
      if (currentUser) {
        this.formEmail.patchValue({
          email: currentUser.email ?? '',
        });
      }
    });
  }

  toggleEmailForm(show: boolean) {
    this.showChangeEmailForm = show;
  }

  saveEmail() {
    this.isLoading$.next(true);
    setTimeout(() => {
      this.isLoading$.next(false);
      this.showChangeEmailForm = false;
      this.cdr.detectChanges();
    }, 1500);
  }

  togglePasswordForm(show: boolean) {
    this.showChangePasswordForm = show;
  }

  savePassword() {
    this.isLoading$.next(true);
    setTimeout(() => {
      this.isLoading$.next(false);
      this.showChangePasswordForm = false;
      this.cdr.detectChanges();
    }, 1500);
  }
}
