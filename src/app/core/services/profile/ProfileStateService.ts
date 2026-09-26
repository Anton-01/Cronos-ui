import { Injectable, inject, signal } from '@angular/core';
import { AccountService } from 'src/app/core/services/account.service';
import { UserResponse } from 'src/app/core/models/user.model';

@Injectable({
  providedIn: 'root'
})
export class ProfileStateService {
  private accountService = inject(AccountService);

  user = signal<UserResponse | null>(null);
  isLoading = signal(false);

  loadProfile(): void {
    if (this.user()) return;

    this.isLoading.set(true);
    this.accountService.getProfile().subscribe({
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
