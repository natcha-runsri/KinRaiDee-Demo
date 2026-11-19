import { Component, DestroyRef, ElementRef, HostListener, OnInit, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { filter } from 'rxjs';
import { AdminMe, AdminNotification, AdminService } from '../../admin.service';
import { LogoutService } from '../../logout.service';
import { UserAvatarComponent } from '../../shared/user-avatar/user-avatar.component';
import { AdminRangeService, todayTh } from './admin-range.service';

interface NavItem { path: string; label: string; icon: string; exact?: boolean; }

/**
 * โครงหน้าแอดมิน (ตาม mockup): แถบด้านข้างสีแดงเข้ม + โลโก้, หัวหน้า = ชื่อหน้า / ช่วงวันที่ (เฉพาะหน้าที่ใช้ — route data range) /
 * กระดิ่งเรื่องที่ต้องจัดการ / ชื่อแอดมิน. จอ ≤ 1023px แถบด้านข้างเป็นลิ้นชักเปิดด้วย ☰ (ปิดเมื่อเลือกเมนู / Esc / กดพื้นหลัง);
 * จอกว้าง ☰ ย่อแถบเหลือไอคอน
 */
@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, UserAvatarComponent],
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.css', './admin-header.css']
})
export class AdminLayoutComponent implements OnInit {

  private admin = inject(AdminService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  readonly rangeState = inject(AdminRangeService);
  private logout = inject(LogoutService);

  @ViewChild('drawerToggle') drawerToggle?: ElementRef<HTMLButtonElement>;

  readonly nav: NavItem[] = [
    { path: '/admin', label: 'หน้าหลัก', icon: 'home', exact: true },
    { path: '/admin/users', label: 'ผู้ใช้', icon: 'users' },
    { path: '/admin/menus', label: 'ข้อมูลอาหาร', icon: 'food' },
    { path: '/admin/analysis', label: 'ภาพรวมการวิเคราะห์', icon: 'chart' },
    { path: '/admin/audit', label: 'ประวัติการแก้ไข', icon: 'audit' },
    { path: '/admin/settings', label: 'ตั้งค่า', icon: 'settings' }
  ];

  me = signal<AdminMe | null>(null);
  /** บัญชีผู้ประเมิน (REVIEWER) — ป้าย "บัญชีดูอย่างเดียว" ที่หัวทุกหน้า */
  readonly readOnly = this.admin.readOnly;
  title = '';
  subtitle = '';
  showRange = false;

  drawerOpen = false;
  collapsed = false;
  rangeOpen = false;
  bellOpen = false;
  userOpen = false;

  customFrom = '';
  customTo = '';
  customError: string | null = null;
  readonly today = todayTh();

  notifications = signal<AdminNotification[]>([]);

  ngOnInit(): void {
    this.admin.me().subscribe({ next: m => this.me.set(m), error: () => {} });
    this.loadNotifications();
    this.readRouteData();
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.readRouteData();
        this.closeAll();
        this.drawerOpen = false;
        this.loadNotifications();
      });
  }

  get notificationCount(): number {
    return this.notifications().reduce((n, x) => n + (x.count > 0 ? 1 : 0), 0);
  }

  // ---------- แถบด้านข้าง ----------

  toggleDrawer(): void {
    if (window.matchMedia('(max-width: 1023.98px)').matches) {
      this.drawerOpen = !this.drawerOpen;
    } else {
      this.collapsed = !this.collapsed;
    }
  }

  closeDrawer(): void {
    if (!this.drawerOpen) return;
    this.drawerOpen = false;
    this.drawerToggle?.nativeElement.focus();
  }

  // ---------- ช่วงวันที่ ----------

  toggleRange(): void {
    const open = !this.rangeOpen;
    this.closeAll();
    this.rangeOpen = open;
    if (open) {
      this.customFrom = this.rangeState.range().from;
      this.customTo = this.rangeState.range().to;
      this.customError = null;
    }
  }

  pickPreset(days: 7 | 30 | 90): void {
    this.rangeState.setPreset(days);
    this.rangeOpen = false;
  }

  applyCustom(): void {
    this.customError = this.rangeState.setCustom(this.customFrom, this.customTo);
    if (!this.customError) this.rangeOpen = false;
  }

  // ---------- กระดิ่ง / เมนูแอดมิน ----------

  toggleBell(): void {
    const open = !this.bellOpen;
    this.closeAll();
    this.bellOpen = open;
  }

  openNotification(n: AdminNotification): void {
    this.bellOpen = false;
    void this.router.navigateByUrl(n.link);
  }

  toggleUser(): void {
    const open = !this.userOpen;
    this.closeAll();
    this.userOpen = open;
  }

  backToSite(): void {
    this.userOpen = false;
    void this.router.navigate(['/home']);
  }

  signOut(): void {
    this.userOpen = false;
    void this.logout.request();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.rangeOpen || this.bellOpen || this.userOpen) {
      this.closeAll();
    } else {
      this.closeDrawer();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (!t.closest('.popover-anchor')) this.closeAll();
  }

  private closeAll(): void {
    this.rangeOpen = false;
    this.bellOpen = false;
    this.userOpen = false;
  }

  private loadNotifications(): void {
    this.admin.notifications().subscribe({ next: n => this.notifications.set(n), error: () => {} });
  }

  private readRouteData(): void {
    let r = this.route;
    while (r.firstChild) r = r.firstChild;
    const d = r.snapshot.data;
    this.title = d['title'] ?? 'จัดการระบบ';
    this.subtitle = d['subtitle'] ?? '';
    this.showRange = !!d['range'];
    document.title = `${this.title} · KinRai`;
  }
}
