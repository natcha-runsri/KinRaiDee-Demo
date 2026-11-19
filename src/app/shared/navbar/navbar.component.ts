import { Component, DestroyRef, ElementRef, HostListener, QueryList, ViewChild, ViewChildren, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../auth.service';
import { LogoutService } from '../../logout.service';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

/**
 * Navbar หลักของ KinRai (ใช้ร่วมกันทุกหน้า). login แล้ว = ปุ่มชื่อผู้ใช้ + รูป → dropdown "โปรไฟล์ผู้ใช้" / "ออกจากระบบ"
 * (ออกจากระบบใช้ LogoutService ตัวเดียวกับ sidebar หน้าโปรไฟล์); ยังไม่ login = ปุ่ม "เข้าสู่ระบบ".
 * ชื่อ/รูปมาจาก AuthService.currentUser → แก้ในหน้าโปรไฟล์แล้วเปลี่ยนทันที.
 * dropdown: ปิดเมื่อกดปุ่มซ้ำ / คลิกข้างนอก / Esc (focus กลับปุ่ม) / เลือกเมนู / เปลี่ยนหน้า; ลูกศรขึ้นลงเลื่อนเมนู.
 * จอ ≤ 767px: แท็บซ่อนหลังปุ่ม ☰ (navOpen) — ปิดเมื่อเลือกแท็บ / เปลี่ยนหน้า / Esc (focus กลับปุ่ม) / คลิกนอกแผง;
 * เปิดแผงนี้แล้ว dropdown ผู้ใช้ปิด และกลับกัน.
 */
@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterModule, UserAvatarComponent],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent {

  readonly authService = inject(AuthService);
  private router = inject(Router);
  private logout = inject(LogoutService);

  menuOpen = false;
  navOpen = false;

  @ViewChild('profileArea') profileArea?: ElementRef<HTMLElement>;
  @ViewChild('navStart') navStart?: ElementRef<HTMLElement>;
  @ViewChild('menuButton') menuButton?: ElementRef<HTMLButtonElement>;
  @ViewChildren('menuItem') menuItems!: QueryList<ElementRef<HTMLButtonElement>>;

  constructor() {
    this.router.events
      .pipe(filter(e => e instanceof NavigationStart), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => {
        this.menuOpen = false;
        this.navOpen = false;
      });
    this.authService.syncRole();
    // ออกจากระบบแล้วปุ่มหาย → ปิดเมนูด้วย
    effect(() => {
      if (!this.authService.currentUser()) this.menuOpen = false;
    });
  }

  /** หน้ารายละเอียดเมนู (/menu/:id) อยู่ใต้หมวด "แนะนำ" */
  isMenuDetail(): boolean {
    return this.router.url.startsWith('/menu/');
  }

  // ---------- เมนู ☰ (จอแคบ) ----------

  toggleNav(): void {
    this.navOpen = !this.navOpen;
    if (this.navOpen) this.menuOpen = false;
  }

  /** เลือกแท็บเดิม (ไม่มี NavigationStart) ก็ปิดแผง */
  onNavLinkClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('a')) this.navOpen = false;
  }

  goToLogin(): void {
    void this.router.navigate(['/login']);
  }

  // ---------- dropdown ----------

  /** คลิกเมาส์ = เปิด/ปิด; Enter/Space (click ที่ detail = 0) = เปิดแล้ว focus เมนูแรก */
  toggleMenu(event?: MouseEvent): void {
    this.navOpen = false;
    if (this.menuOpen) {
      this.closeMenu(false);
    } else if (event && event.detail === 0) {
      this.openWithFocus(0);
    } else {
      this.menuOpen = true;
    }
  }

  /** เปิดด้วยคีย์บอร์ด → focus เมนูแรก/สุดท้ายหลังเมนูถูกสร้าง */
  private openWithFocus(index: number): void {
    this.menuOpen = true;
    setTimeout(() => this.focusItem(index));
  }

  closeMenu(returnFocus: boolean): void {
    this.menuOpen = false;
    if (returnFocus) this.menuButton?.nativeElement.focus();
  }

  goToProfile(): void {
    this.closeMenu(false);
    void this.router.navigate(['/profile']);
  }

  /** เฉพาะแอดมิน (backend ตรวจ role อีกชั้นที่ /api/admin/**) */
  goToAdmin(): void {
    this.closeMenu(false);
    void this.router.navigate(['/admin']);
  }

  logoutFromMenu(): void {
    // focus กลับปุ่มก่อน → pop-up ยืนยันคืน focus ให้ปุ่มตอนปิด
    this.closeMenu(true);
    void this.logout.request();
  }

  onButtonKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.menuOpen ? this.focusItem(0) : this.openWithFocus(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.menuOpen ? this.focusItem(-1) : this.openWithFocus(-1);
    }
  }

  onMenuKeydown(event: KeyboardEvent): void {
    const items = this.menuItems.toArray().map(i => i.nativeElement);
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); this.focusItem((idx + 1) % items.length); break;
      case 'ArrowUp': event.preventDefault(); this.focusItem((idx - 1 + items.length) % items.length); break;
      case 'Home': event.preventDefault(); this.focusItem(0); break;
      case 'End': event.preventDefault(); this.focusItem(-1); break;
      case 'Tab': this.closeMenu(false); break;
    }
  }

  private focusItem(index: number): void {
    const items = this.menuItems?.toArray() ?? [];
    if (!items.length) return;
    items[index < 0 ? items.length - 1 : index].nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menuOpen) this.closeMenu(true);
    if (this.navOpen) {
      this.navOpen = false;
      this.navStart?.nativeElement.querySelector<HTMLButtonElement>('.menu-toggle')?.focus();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;
    if (this.menuOpen && !this.profileArea?.nativeElement.contains(target)) {
      this.closeMenu(false);
    }
    if (this.navOpen && !this.navStart?.nativeElement.contains(target)
        && !(target instanceof Element && target.closest('#main-menu'))) {
      this.navOpen = false;
    }
  }
}
