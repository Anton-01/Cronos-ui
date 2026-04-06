import { Component, OnInit, OnDestroy, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, interval } from 'rxjs';
import { PublicRecipeService } from 'src/app/core/services/domain/public-recipe.service';
import {
  PublicSharedRecipeResponse,
  PublicRecipeFile,
} from 'src/app/core/models/domain.model';

@Component({
  selector: 'app-shared-recipe',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shared-recipe.component.html',
  styleUrls: ['./shared-recipe.component.scss'],
})
export class SharedRecipeComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private publicRecipeService = inject(PublicRecipeService);
  private destroy$ = new Subject<void>();

  // State
  recipe = signal<PublicSharedRecipeResponse | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  // Slider
  activeImageIndex = signal(0);

  // Modal
  modalOpen = signal(false);
  modalImage = signal<PublicRecipeFile | null>(null);

  // Countdown
  countdown = signal({ days: 0, hours: 0, minutes: 0, expired: false });

  // Computed
  images = computed(() => {
    const r = this.recipe();
    if (!r) return [];
    return r.files.filter(f => f.fileType.startsWith('image'));
  });

  instructionSteps = computed(() => {
    const r = this.recipe();
    if (!r?.instructions) return [];
    return r.instructions
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  });

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.error.set('Enlace inválido.');
      this.loading.set(false);
      return;
    }

    this.publicRecipeService.getSharedRecipe(token)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.recipe.set(res.data);
          this.loading.set(false);
          this.startCountdown(res.data.expiresAt);
        },
        error: (err) => {
          const message = err?.message || 'Este enlace ha expirado o no es válido.';
          this.error.set(message);
          this.loading.set(false);
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // --- Slider ---
  setActiveImage(index: number): void {
    this.activeImageIndex.set(index);
  }

  nextImage(): void {
    const imgs = this.images();
    if (imgs.length === 0) return;
    this.activeImageIndex.set((this.activeImageIndex() + 1) % imgs.length);
  }

  prevImage(): void {
    const imgs = this.images();
    if (imgs.length === 0) return;
    this.activeImageIndex.set(
      (this.activeImageIndex() - 1 + imgs.length) % imgs.length
    );
  }

  // --- Modal ---
  openModal(img: PublicRecipeFile): void {
    this.modalImage.set(img);
    this.modalOpen.set(true);
    document.body.classList.add('overflow-hidden');
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.modalImage.set(null);
    document.body.classList.remove('overflow-hidden');
  }

  nextModalImage(): void {
    const imgs = this.images();
    if (imgs.length <= 1) return;
    const currentIdx = imgs.indexOf(this.modalImage()!);
    const nextIdx = (currentIdx + 1) % imgs.length;
    this.modalImage.set(imgs[nextIdx]);
  }

  prevModalImage(): void {
    const imgs = this.images();
    if (imgs.length <= 1) return;
    const currentIdx = imgs.indexOf(this.modalImage()!);
    const prevIdx = (currentIdx - 1 + imgs.length) % imgs.length;
    this.modalImage.set(imgs[prevIdx]);
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!this.modalOpen()) return;
    if (event.key === 'Escape') this.closeModal();
    if (event.key === 'ArrowRight') this.nextModalImage();
    if (event.key === 'ArrowLeft') this.prevModalImage();
  }

  // --- Helpers ---
  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  getModalImageIndex(): number {
    const img = this.modalImage();
    if (!img) return 0;
    return this.images().indexOf(img);
  }

  private startCountdown(expiresAt: string): void {
    this.updateCountdown(expiresAt);
    interval(60000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.updateCountdown(expiresAt));
  }

  private updateCountdown(expiresAt: string): void {
    const now = new Date().getTime();
    const exp = new Date(expiresAt).getTime();
    const diff = exp - now;

    if (diff <= 0) {
      this.countdown.set({ days: 0, hours: 0, minutes: 0, expired: true });
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    this.countdown.set({ days, hours, minutes, expired: false });
  }
}
