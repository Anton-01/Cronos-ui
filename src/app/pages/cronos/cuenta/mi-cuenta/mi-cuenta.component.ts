import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { UserService } from 'src/app/core/services/user.service';
import { TokenService } from 'src/app/core/services/token.service';
import { UserResponse } from 'src/app/core/models/user.model';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-mi-cuenta',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './mi-cuenta.component.html',
})
export class MiCuentaComponent implements OnInit {
  private userService = inject(UserService);
  private tokenService = inject(TokenService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  user = signal<UserResponse | null>(null);
  isLoading = signal(false);
  isSaving = signal(false);

  form = this.fb.group({
    firstName: [''],
    lastName: [''],
    phoneNumber: [''],
    username: [''],
  });

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {
    this.isLoading.set(true);
    this.userService.getProfile().subscribe({
      next: res => {
        this.user.set(res.data);
        this.form.patchValue({
          firstName: res.data.firstName ?? '',
          lastName: res.data.lastName ?? '',
          phoneNumber: res.data.phoneNumber ?? '',
          username: res.data.username,
        });
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  save(): void {
    this.isSaving.set(true);
    this.userService.updateProfile({
      firstName: this.form.value.firstName || undefined,
      lastName: this.form.value.lastName || undefined,
      phoneNumber: this.form.value.phoneNumber || undefined,
      username: this.form.value.username || undefined,
    }).subscribe({
      next: res => {
        this.isSaving.set(false);
        this.user.set(res.data);
        this.tokenService.saveUserInfo(res.data.username, res.data.email);
        this.toast.success('Perfil actualizado');
      },
      error: err => {
        this.isSaving.set(false);
        this.toast.error('Error', err?.message);
      },
    });
  }
}
