import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AdminService, AuditEntry, AuditPage } from '../../../admin.service';
import { AdminRangeService } from '../admin-range.service';

const TH_DT = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

/** ค่าก่อน/หลังเป็นข้อความอ่านง่าย (คีย์ → ป้ายไทย) */
const FIELD_LABELS: Record<string, string> = {
  role: 'role', status: 'สถานะ', visibility: 'การแสดง', hidden: 'ซ่อน', shortName: 'ชื่อสั้น', tags: 'tag',
  imageUrl: 'รูป', credit: 'เครดิต', value: 'ค่า'
};

const VALUE_LABELS: Record<string, string> = {
  HIDDEN: 'ซ่อนโดยแอดมิน', SHOWN: 'แอดมินเปิดทับ', active: 'ใช้งานได้', suspended: 'ถูกระงับ'
};

/**
 * ประวัติการแก้ไข (/admin/audit): ทุกการแก้ของแอดมิน กรองตามแอดมิน / ประเภท / การกระทำ + ช่วงวันที่บนหัวหน้า,
 * แสดงค่าก่อน/หลังและเหตุผล — เมนูลิงก์ไปแผงแก้ไขในหน้าข้อมูลอาหาร
 */
@Component({
  selector: 'app-admin-audit',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-audit.component.html',
  styleUrls: ['../admin-shared.css', './admin-audit.component.css']
})
export class AdminAuditComponent {

  private admin = inject(AdminService);
  readonly rangeState = inject(AdminRangeService);
  private sub?: Subscription;

  adminFilter = '';
  type = '';
  action = '';
  page = 0;
  data = signal<AuditPage | null>(null);
  loading = signal(true);
  error = signal(false);
  open = signal<number | null>(null);

  constructor() {
    effect(() => {
      this.rangeState.range();
      this.page = 0;
      this.load();
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
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

  get actionOptions(): [string, string][] {
    return Object.entries(this.data()?.actions ?? {});
  }

  get typeOptions(): [string, string][] {
    return Object.entries(this.data()?.types ?? {});
  }

  when(iso: string): string {
    return TH_DT.format(new Date(iso));
  }

  toggle(e: AuditEntry): void {
    this.open.set(this.open() === e.id ? null : e.id);
  }

  /** {"role":"USER"} → [["role","USER"]] */
  fields(v: unknown): [string, string][] {
    if (v == null) return [];
    if (typeof v !== 'object') return [['ค่า', String(v)]];
    return Object.entries(v as Record<string, unknown>).map(([k, x]) => [FIELD_LABELS[k] ?? k, this.text(x)]);
  }

  private text(x: unknown): string {
    if (x == null) return '— (ค่าต้นทาง)';
    if (typeof x === 'boolean') return x ? 'ใช่' : 'ไม่';
    if (Array.isArray(x)) return x.length ? x.join(', ') : '(ว่าง)';
    if (typeof x === 'object') return JSON.stringify(x);
    return VALUE_LABELS[String(x)] ?? String(x);
  }

  private load(): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(false);
    const r = this.rangeState.range();
    this.sub = this.admin.audit({ admin: this.adminFilter, type: this.type, action: this.action, from: r.from, to: r.to, page: this.page })
      .subscribe({
        next: d => { this.data.set(d); this.loading.set(false); },
        error: () => { this.loading.set(false); this.error.set(true); }
      });
  }
}
