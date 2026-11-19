import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { AdminService, MenuFilter, MenuPage, MenuRow } from '../../../admin.service';
import { MenuImageComponent } from '../../../shared/menu-image/menu-image.component';
import { AdminMenuDetailComponent } from './admin-menu-detail.component';

/**
 * ข้อมูลอาหาร (/admin/menus): ค้นหา + กรองประเภท / สถานะ / รูป + เรียงความนิยม + แบ่งหน้า — ตัวกรองอยู่ใน URL
 * (กระดิ่ง → ?status=recommended&image=none, อาหารยอดนิยม → ?sort=popular). กดแถว = แผงรายละเอียด/แก้ไข
 */
@Component({
  selector: 'app-admin-menus',
  standalone: true,
  imports: [FormsModule, MenuImageComponent, AdminMenuDetailComponent],
  templateUrl: './admin-menus.component.html',
  styleUrls: ['../admin-shared.css', './admin-menus.component.css']
})
export class AdminMenusComponent implements OnInit {

  private admin = inject(AdminService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private search$ = new Subject<string>();
  private sub?: Subscription;

  readonly statuses = [
    { value: '', label: 'ทุกสถานะ' },
    { value: 'recommended', label: 'แนะนำอยู่' },
    { value: 'hidden', label: 'ถูกซ่อน (ทุกแหล่ง)' },
    { value: 'admin-hidden', label: 'ซ่อนโดยแอดมิน' },
    { value: 'admin-shown', label: 'แอดมินเปิดทับ' },
    { value: 'non-meal', label: 'ไม่ใช่มื้ออาหาร' },
    { value: 'suspect', label: 'ข้อมูลไม่ตรง (suspect)' },
    { value: 'edited', label: 'แอดมินแก้แล้ว' }
  ];
  readonly sorts = [
    { value: '', label: 'ชื่อ' },
    { value: 'popular', label: 'ความนิยม' },
    { value: 'updated', label: 'แก้ล่าสุด' }
  ];

  filter: MenuFilter = { q: '', type: '', status: '', image: '', sort: '', page: 0, size: 20 };
  data = signal<MenuPage | null>(null);
  loading = signal(true);
  error = signal(false);
  selected = signal<string | null>(null);

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(q => {
      this.filter = {
        q: q.get('q') ?? '', type: q.get('type') ?? '', status: q.get('status') ?? '', image: q.get('image') ?? '',
        sort: q.get('sort') ?? '', page: Number(q.get('page') ?? 0) || 0, size: 20
      };
      this.selected.set(q.get('menu'));
      this.load();
    });
    this.search$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe(q => this.apply({ q, page: 0 }));
  }

  onSearch(q: string): void {
    this.search$.next(q);
  }

  /** เปลี่ยนตัวกรอง → URL (โหลดใหม่จาก queryParamMap) */
  apply(patch: Partial<MenuFilter>): void {
    const next = { ...this.filter, ...patch };
    const params: Record<string, string | null> = {};
    for (const k of ['q', 'type', 'status', 'image', 'sort'] as const) params[k] = (next[k] as string) || null;
    params['page'] = next.page ? String(next.page) : null;
    params['menu'] = this.selected();
    void this.router.navigate([], { relativeTo: this.route, queryParams: params });
  }

  open(row: MenuRow): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { menu: row.id }, queryParamsHandling: 'merge' });
  }

  closeDetail(changed: boolean): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { menu: null }, queryParamsHandling: 'merge' });
    if (changed) this.load();
  }

  onChanged(): void {
    this.load(false);
  }

  get pages(): number {
    const d = this.data();
    return d ? Math.max(1, Math.ceil(d.total / d.size)) : 1;
  }

  statusOf(r: MenuRow): { label: string; tone: string } {
    if (r.visibility === 'HIDDEN') return { label: 'ซ่อนโดยแอดมิน', tone: 'admin' };
    if (r.hidden) return { label: r.hiddenSources[0]?.key === 'suspect' ? 'ข้อมูลไม่ตรง' : 'ไม่ใช่มื้ออาหาร', tone: 'file' };
    if (r.visibility === 'SHOWN') return { label: 'แอดมินเปิดทับ', tone: 'shown' };
    return r.recommended ? { label: 'แนะนำอยู่', tone: 'ok' } : { label: 'ไม่มีรูปต้นทาง', tone: 'muted' };
  }

  retry(): void {
    this.load();
  }

  private load(showLoading = true): void {
    this.sub?.unsubscribe();
    if (showLoading) this.loading.set(true);
    this.error.set(false);
    this.sub = this.admin.menus(this.filter).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(true); }
    });
  }
}
