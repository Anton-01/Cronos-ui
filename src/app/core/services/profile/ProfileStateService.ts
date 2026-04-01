import { Injectable, inject, signal } from '@angular/core';
import { UserService } from 'src/app/core/services/user.service';
import { UserResponse } from 'src/app/core/models/user.model';

@Injectable({
  providedIn: 'root'
})
export class ProfileStateService {
  private userService = inject(UserService);

  user = signal<UserResponse | null>(null);
  isLoading = signal(false);

  loadProfile(): void {
    if (this.user()) return;

    this.isLoading.set(true);
    this.userService.getProfile().subscribe({
      next: (res) => {
        this.user.set(res.data);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  updateUserSignal(data: UserResponse): void {
    this.user.set(data);
  }
}
