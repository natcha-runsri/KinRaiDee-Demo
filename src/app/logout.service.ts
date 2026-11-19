import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ProfileStateService } from './pages/profile/profile-state.service';

/**
 * Flow ออกจากระบบที่เดียวของทั้งแอป (dropdown ใน navbar + เมนูใน sidebar หน้าโปรไฟล์):
 * มีการแก้ไขค้าง → ถามทิ้งก่อน → pop-up "ต้องการออกจากระบบใช่ไหม" (AppComponent แสดงตาม {@link confirmOpen})
 * → revoke refresh token + ล้าง token ฝั่งนี้ (API ล้มก็ยังออก) → /home.
 */
@Injectable({ providedIn: 'root' })
export class LogoutService {

  readonly confirmOpen = signal(false);

  constructor(
    private auth: AuthService,
    private profileState: ProfileStateService,
    private router: Router
  ) {}

  async request(): Promise<void> {
    if (this.confirmOpen()) return;
    if (!(await this.profileState.confirmDiscardIfDirty())) return;
    this.confirmOpen.set(true);
  }

  confirm(): void {
    this.confirmOpen.set(false);
    this.profileState.setDiscardPrompt(null); // ยืนยันทิ้งแล้ว — ไม่ถามซ้ำตอนเปลี่ยนหน้า
    this.auth.logout();
    void this.router.navigate(['/home']);
  }

  cancel(): void {
    this.confirmOpen.set(false);
  }
}
