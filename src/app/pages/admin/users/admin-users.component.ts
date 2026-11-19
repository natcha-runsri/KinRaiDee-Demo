import { Component, DestroyRef, HostListener, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { AdminService, AdminUserPage, AdminUserRow } from '../../../admin.service';
import { AuthService, UserRole } from '../../../auth.service';

type ActionKind = 'suspend' | 'unsuspend' | 'role';

const TH_DATE = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });

/**
 * ผู้ใช้ (/admin/users): ค้นหาด้วย username / อีเมล, กรองสถานะ / role, ระงับ / เปิดบัญชี / เปลี่ยน role (ต้องมีเหตุผล).
 * แสดงเท่าที่จำเป็น — อีเมลปิดบางส่วนจาก backend, ไม่มีข้อมูลสุขภาพ/ผลวิเคราะห์. ห้ามระงับตัวเอง (ปุ่มปิด + backend 409)
 */
@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-users.component.html',
  styleUrls: ['../admin-shared.css', './admin-users.component.css']
})
export class AdminUsersComponent implements OnInit {

  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private search$ = new Subject<string>();
  private sub?: Subscription;

  q = '';
  status = '';
  role = '';
  page = 0;
  data = signal<AdminUserPage | null>(null);
  loading = signal(true);
  error = signal(false);

  /** dialog ยืนยันการแก้ */
  target = signal<AdminUserRow | null>(null);
  kind = signal<ActionKind | null>(null);
  newRole: UserRole = 'USER';
  /** บัญชีผู้ประเมิน: ปุ่มระงับ / เปลี่ยน role กดไม่ได้ */
  readonly ro = this.admin.readOnly;
  reason = '';
  formError = '';
  busy = signal(false);
  notice = signal<string | null>(null);

  ngOnInit(): void {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.page = 0; this.load(); });
    this.load();
  }

  onSearch(): void {
    this.search$.next(this.q);
  }

  onFilter(): void {
    this.page = 0;
    this.load();
  }

  goPage(p: number): void {
    this.page = p;
    this.load();
  }

  get pages(): number {
    const d = this.data();
    return d ? Math.max(1, Math.ceil(d.total / d.size)) : 1;
  }

  date(iso: string | null): string {
    return iso ? TH_DATE.format(new Date(iso)) : '-';
  }

  // ---------- การแก้ ----------

  open(u: AdminUserRow, kind: ActionKind): void {
    this.target.set(u);
    this.kind.set(kind);
    // ค่าเริ่มต้นของ dialog = สิทธิ์น้อยกว่าเดิม (ADMIN → USER, USER → REVIEWER, REVIEWER → USER)
    this.newRole = u.role === 'USER' ? 'REVIEWER' : 'USER';
    this.reason = '';
    this.formError = '';
  }

  @HostListener('document:keydown.escape')
  cancel(): void {
    this.target.set(null);
    this.kind.set(null);
  }

  get dialogTitle(): string {
    const u = this.target();
    switch (this.kind()) {
      case 'suspend': return `ระงับบัญชี ${u?.username}`;
      case 'unsuspend': return `เปิดบัญชี ${u?.username}`;
      default: return `เปลี่ยน role ของ ${u?.username}`;
    }
  }

  confirm(): void {
    const u = this.target();
    const kind = this.kind();
    if (!u || !kind) return;
    if (!this.reason.trim()) {
      this.formError = 'กรุณาระบุเหตุผล';
      return;
    }
    this.busy.set(true);
    const req = kind === 'role'
      ? this.admin.setUserRole(u.id, this.newRole, this.reason.trim())
      : this.admin.setUserStatus(u.id, kind, this.reason.trim());
    req.subscribe({
      next: () => {
        this.busy.set(false);
        const selfDemoted = kind === 'role' && u.self && this.newRole === 'USER';
        this.notice.set(kind === 'suspend' ? `ระงับบัญชี ${u.username} แล้ว — ออกจากระบบทุกอุปกรณ์ทันที`
          : kind === 'unsuspend' ? `เปิดบัญชี ${u.username} แล้ว` : `เปลี่ยน role ของ ${u.username} เป็น ${this.newRole} แล้ว`);
        this.cancel();
        if (kind === 'role' && u.self && this.newRole === 'REVIEWER') {
          this.auth.updateUser({ role: 'REVIEWER' });
          this.admin.readOnly.set(true);
        }
        if (selfDemoted) {
          this.auth.updateUser({ role: 'USER' });
          void this.router.navigate(['/home']);
          return;
        }
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        const f = this.auth.toFormError(e);
        this.formError = f.fields['reason'] ?? f.fields['role'] ?? f.message;
      }
    });
  }

  retry(): void {
    this.load();
  }

  private load(): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(false);
    this.sub = this.admin.users(this.q.trim(), this.status, this.role, this.page).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(true); }
    });
  }
}
