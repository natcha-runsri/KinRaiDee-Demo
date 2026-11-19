import { AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, filter, fromEvent } from 'rxjs';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { UserAvatarComponent } from '../../shared/user-avatar/user-avatar.component';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { AccountService, Account } from '../../account.service';
import { AuthService } from '../../auth.service';
import { avatarFileError } from '../../profile.validators';
import { ProfileStateService } from './profile-state.service';
import { LogoutService } from '../../logout.service';

/**
 * โครงหน้าโปรไฟล์ (/profile, /profile/dashboard — เมนู "ประวัติ" ไปหน้า /history): sidebar แดงเข้ม (รูป + เปลี่ยนรูป, "สวัสดี ...", เมนู) + เนื้อหาขวา.
 * รูปโปรไฟล์: เลือกไฟล์ → ตรวจชนิด/ขนาด → ตัวอย่าง + "บันทึกรูป"/"ยกเลิก" → อัปโหลดผ่าน backend (Cloudinary).
 * ออกจากระบบ: ผ่าน LogoutService (ถามทิ้งการแก้ไข → ยืนยัน → revoke + ล้าง token → /home).
 */
@Component({
  selector: 'app-profile-layout',
  standalone: true,
  imports: [NavbarComponent, UserAvatarComponent, ConfirmDialogComponent, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './profile-layout.component.html',
  styleUrl: './profile-layout.component.css'
})
export class ProfileLayoutComponent implements OnInit, AfterViewInit, OnDestroy {

  private accounts = inject(AccountService);
  readonly auth = inject(AuthService);
  readonly state = inject(ProfileStateService);
  private router = inject(Router);
  readonly logout = inject(LogoutService);

  readonly account = this.state.account;
  readonly name = computed(() => {
    const a = this.account();
    const u = this.auth.currentUser();
    return a?.displayName || a?.username || u?.displayName || u?.username || '';
  });

  loadError = '';
  previewUrl: string | null = null;
  private previewFile: File | null = null;
  uploading = false;
  avatarError = '';
  avatarStatus = '';

  removeOpen = false;

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('menuNav') menuNav?: ElementRef<HTMLElement>;
  private destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.accounts.get().subscribe({
      next: acc => this.applyAccount(acc),
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.auth.clearSession();
          void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
          return;
        }
        this.loadError = 'โหลดข้อมูลบัญชีไม่สำเร็จ กรุณารีเฟรชหน้า';
      }
    });
  }

  ngAfterViewInit(): void {
    this.revealActiveTab();
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.revealActiveTab());
    fromEvent(window, 'resize')
      .pipe(debounceTime(150), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.revealActiveTab());
  }

  /** จอแคบ: เมนูเป็นแท็บแนวนอนที่เลื่อนได้ — เลื่อนแท็บที่ active ให้อยู่ในจอเสมอ (เลื่อนเฉพาะแถบเมนู) */
  private revealActiveTab(): void {
    setTimeout(() => {
      const nav = this.menuNav?.nativeElement;
      const active = nav?.querySelector<HTMLElement>('.menu-item.active');
      if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
      const left = active.offsetLeft - nav.offsetLeft;
      if (left < nav.scrollLeft || left + active.offsetWidth > nav.scrollLeft + nav.clientWidth) {
        nav.scrollLeft = left - (nav.clientWidth - active.offsetWidth) / 2;
      }
    });
  }

  ngOnDestroy(): void {
    this.clearPreview();
    this.state.account.set(null);
  }

  // ---------- รูปโปรไฟล์ ----------

  pickFile(): void {
    if (this.uploading) return;
    this.avatarError = '';
    this.fileInput.nativeElement.value = '';
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // เลือกไฟล์เดิมซ้ำได้ (change ยิงทุกครั้ง)
    if (!file) return;
    const problem = avatarFileError(file);
    if (problem) {
      this.avatarError = problem;
      return;
    }
    this.clearPreview();
    this.previewFile = file;
    this.previewUrl = URL.createObjectURL(file);
    this.avatarStatus = 'ตัวอย่างรูปใหม่ — กดบันทึกรูปเพื่อใช้รูปนี้';
  }

  saveAvatar(): void {
    if (!this.previewFile || this.uploading) return;
    this.uploading = true;
    this.avatarError = '';
    this.accounts.uploadAvatar(this.previewFile).subscribe({
      next: acc => {
        this.uploading = false;
        this.clearPreview();
        this.applyAccount(acc);
        this.avatarStatus = 'บันทึกรูปโปรไฟล์แล้ว';
      },
      error: (err: HttpErrorResponse) => {
        this.uploading = false;
        const e = this.auth.toFormError(err);
        this.avatarError = e.fields['avatar'] || e.message || 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่';
      }
    });
  }

  cancelPreview(): void {
    this.clearPreview();
    this.avatarStatus = '';
  }

  confirmRemove(): void {
    this.removeOpen = false;
    this.uploading = true;
    this.accounts.deleteAvatar().subscribe({
      next: acc => {
        this.uploading = false;
        this.applyAccount(acc);
        this.avatarStatus = 'ลบรูปโปรไฟล์แล้ว';
      },
      error: (err: HttpErrorResponse) => {
        this.uploading = false;
        this.avatarError = this.auth.toFormError(err).message || 'ลบรูปไม่สำเร็จ กรุณาลองใหม่';
      }
    });
  }

  private clearPreview(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    this.previewFile = null;
  }

  private applyAccount(acc: Account): void {
    this.state.account.set(acc);
    this.auth.updateUser({ username: acc.username, email: acc.email, displayName: acc.displayName, avatarUrl: acc.avatarUrl });
  }

  // ---------- ออกจากระบบ (flow เดียวกับ dropdown ใน navbar) ----------

  askLogout(): void {
    void this.logout.request();
  }
}
