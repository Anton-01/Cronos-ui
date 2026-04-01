import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { UserService } from 'src/app/core/services/user.service';
import { TokenService } from 'src/app/core/services/token.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import {ProfileStateService} from "../../../../../core/services/profile/ProfileStateService";

@Component({
  selector: 'app-profile-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile-details.component.html',
})
export class ProfileDetailsComponent {
  public profileState = inject(ProfileStateService);
  private userService = inject(UserService);
  private tokenService = inject(TokenService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  isSaving = signal(false);

  form = this.fb.group({
    firstName: [''], lastName: [''], phoneNumber: [''], username: [''],
  });

  constructor() {
    effect(() => {
      const currentUser = this.profileState.user();
      if (currentUser) {
        this.form.patchValue({
          firstName: currentUser.firstName ?? '',
          lastName: currentUser.lastName ?? '',
          phoneNumber: currentUser.phoneNumber ?? '',
          username: currentUser.username ?? '',
        });
      }
    });
  }

  saveSettings(): void {
    this.isSaving.set(true);
    const formValues = this.form.value;

    this.userService.updateProfile({
      firstName: formValues.firstName || undefined,
      lastName: formValues.lastName || undefined,
      phoneNumber: formValues.phoneNumber || undefined,
      username: formValues.username || undefined,
    }).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.profileState.user.set(res.data);

        this.tokenService.saveUserInfo(res.data.username, res.data.email);
        this.toast.success('Perfil actualizado correctamente');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.toast.error('Error al actualizar', err?.message);
      },
    });
  }
}
