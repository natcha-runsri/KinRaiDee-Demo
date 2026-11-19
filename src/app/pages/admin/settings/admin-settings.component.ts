import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AdminService, AppSetting, SettingsView } from '../../../admin.service';
import { AuthService } from '../../../auth.service';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';

type Draft = Record<string, number | boolean | string[]>;

const TH_DT = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

/**
 * ตั้งค่า (/admin/settings): โควตาสุ่ม / แชต AI (1–100) และการซ่อนเมนูที่ไม่ใช่มื้ออาหาร + ประเภท — บันทึกแล้วมีผลทันที,
 * คืนค่าเริ่มต้นรายค่า / ทั้งหมด. analysis-rules.yml และ allergens.yml แสดงอย่างเดียว
 */
@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [FormsModule, ConfirmDialogComponent],
  templateUrl: './admin-settings.component.html',
  styleUrls: ['../admin-shared.css', './admin-settings.component.css']
})
export class AdminSettingsComponent implements OnInit {

  private admin = inject(AdminService);
  /** บัญชีผู้ประเมิน: ค่าตั้งและปุ่มบันทึก/คืนค่ากดไม่ได้ */
  readonly ro = this.admin.readOnly;
  private auth = inject(AuthService);

  data = signal<SettingsView | null>(null);
  error = signal(false);
  busy = signal(false);
  notice = signal<string | null>(null);
  draft: Draft = {};
  reason = '';
  fieldErrors: Record<string, string> = {};
  generalError = '';
  confirmReset = signal<string[] | null>(null);

  ngOnInit(): void {
    this.admin.settings().subscribe({ next: v => this.fill(v), error: () => this.error.set(true) });
  }

  get groups(): { name: string; items: AppSetting[] }[] {
    const out: { name: string; items: AppSetting[] }[] = [];
    for (const s of this.data()?.settings ?? []) {
      let g = out.find(x => x.name === s.definition.group);
      if (!g) out.push(g = { name: s.definition.group, items: [] });
      g.items.push(s);
    }
    return out;
  }

  get changed(): string[] {
    return (this.data()?.settings ?? []).filter(s => JSON.stringify(this.norm(this.draft[s.definition.key]))
      !== JSON.stringify(this.norm(s.value))).map(s => s.definition.key);
  }

  get overridden(): string[] {
    return (this.data()?.settings ?? []).filter(s => s.overridden).map(s => s.definition.key);
  }

  get nonMealOn(): boolean {
    return this.draft['non-meal.exclude'] === true;
  }

  hasCategory(key: string, c: string): boolean {
    return (this.draft[key] as string[]).includes(c);
  }

  toggleCategory(key: string, c: string, on: boolean): void {
    const cur = new Set(this.draft[key] as string[]);
    if (on) cur.add(c); else cur.delete(c);
    this.draft[key] = [...cur].sort((a, b) => a.localeCompare(b, 'th'));
  }

  display(v: AppSetting['value']): string {
    if (typeof v === 'boolean') return v ? 'เปิด' : 'ปิด';
    if (Array.isArray(v)) return v.length ? v.join(', ') : 'ไม่ซ่อนประเภทใด';
    return String(v);
  }

  when(iso: string | null): string {
    return iso ? TH_DT.format(new Date(iso)) : '';
  }

  save(): void {
    const keys = this.changed;
    if (!keys.length) return;
    const values: Record<string, unknown> = {};
    for (const k of keys) values[k] = this.draft[k];
    this.busy.set(true);
    this.fieldErrors = {};
    this.generalError = '';
    this.admin.updateSettings(values, this.reason.trim()).subscribe({
      next: v => { this.busy.set(false); this.fill(v); this.notice.set('บันทึกแล้ว — มีผลทันที'); },
      error: (e: HttpErrorResponse) => this.fail(e)
    });
  }

  askReset(keys: string[]): void {
    this.confirmReset.set(keys);
  }

  reset(): void {
    const keys = this.confirmReset() ?? [];
    this.confirmReset.set(null);
    this.busy.set(true);
    this.admin.resetSettings(keys, this.reason.trim()).subscribe({
      next: v => { this.busy.set(false); this.fill(v); this.notice.set('คืนค่าเริ่มต้นแล้ว'); },
      error: (e: HttpErrorResponse) => this.fail(e)
    });
  }

  discard(): void {
    const d = this.data();
    if (d) this.fill(d);
  }

  private fail(e: HttpErrorResponse): void {
    this.busy.set(false);
    const f = this.auth.toFormError(e);
    this.fieldErrors = f.fields;
    this.generalError = Object.keys(f.fields).length ? '' : f.message;
  }

  private fill(v: SettingsView): void {
    this.data.set(v);
    this.draft = {};
    for (const s of v.settings) this.draft[s.definition.key] = Array.isArray(s.value) ? [...s.value] : s.value;
    this.reason = '';
    this.fieldErrors = {};
  }

  /** เทียบค่าก่อน/หลัง: รายการประเภทเทียบแบบไม่สนลำดับ (backend เรียงตาม code point, หน้าเว็บเรียงแบบไทย) */
  private norm(v: unknown): unknown {
    if (Array.isArray(v)) return [...v].sort((a, b) => String(a).localeCompare(String(b), 'th'));
    return typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
  }
}
