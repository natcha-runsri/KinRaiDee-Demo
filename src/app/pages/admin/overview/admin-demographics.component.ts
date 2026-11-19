import { Component, Input } from '@angular/core';
import { Metric, Slice } from '../../../admin.service';

interface Arc { slice: Slice | null; color: string; dash: string; offset: number; }

const R = 58;
const C = 2 * Math.PI * R;
const GAP = 2;   // ช่องว่าง 2px ระหว่างส่วนของ donut

/**
 * สัดส่วนเพศ (donut) และช่วงอายุ (แท่ง) — ข้อมูลรวมของบัญชีจริง; กลุ่มที่น้อยกว่า 5 คนไม่แสดงตัวเลข:
 * donut รวมส่วนที่ซ่อนเป็นส่วนสีเทาส่วนเดียว, แท่งที่ซ่อนเป็นแท่งลายเส้นสูงเท่าแถบ "น้อยกว่า 5" (ไม่ใช่ค่าจริง)
 */
@Component({
  selector: 'app-admin-demographics',
  standalone: true,
  templateUrl: './admin-demographics.component.html',
  styleUrls: ['../admin-shared.css', './admin-demographics.component.css']
})
export class AdminDemographicsComponent {

  @Input() gender: Slice[] = [];
  @Input() age: Slice[] = [];
  @Input() total: Metric | null = null;

  readonly r = R;
  readonly colors: Record<string, string> = { female: '#e8566a', male: '#1e5fb8', other: '#c27c0e', unknown: '#8d8280' };
  readonly hiddenColor = '#e6ddd7';
  readonly barH = 150;

  get arcs(): Arc[] {
    const out: Arc[] = [];
    let start = 0;
    const visible = this.gender.filter(s => s.percent != null && s.percent > 0);
    const shown = visible.reduce((n, s) => n + (s.percent ?? 0), 0);
    const parts: { slice: Slice | null; pct: number; color: string }[] = visible.map(s => ({ slice: s, pct: s.percent!, color: this.colors[s.key] }));
    if (shown < 100) parts.push({ slice: null, pct: 100 - shown, color: this.hiddenColor });
    for (const p of parts) {
      const len = (p.pct / 100) * C;
      const gap = parts.length > 1 ? GAP : 0;
      out.push({ slice: p.slice, color: p.color, dash: `${Math.max(0, len - gap)} ${C}`, offset: -start });
      start += len;
    }
    return out;
  }

  get hasHiddenGender(): boolean {
    return this.gender.some(s => s.count.value == null);
  }

  get barMax(): number {
    const max = Math.max(10, ...this.age.map(s => s.count.value ?? 0));
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= max) return m * mag;
    return 10 * mag;
  }

  barHeight(s: Slice): number {
    const v = s.count.value ?? 5;
    return Math.max(4, (v / this.barMax) * this.barH);
  }

  /** ป้ายบนแท่ง: ที่ซ่อน = "<5" (ป้ายเต็มอยู่ใน title / ตารางสำหรับ screen reader) */
  barText(s: Slice): string {
    return s.count.value == null ? '<5' : s.count.label;
  }

  get ageTicks(): number[] {
    return [0, 0.5, 1].map(f => Math.round(this.barMax * f));
  }

  get genderSummary(): string {
    return 'สัดส่วนเพศผู้ใช้: ' + this.gender.map(s => `${s.label} ${s.percent != null ? s.percent + '%' : s.count.label}`).join(', ');
  }

  get ageSummary(): string {
    return 'ช่วงอายุผู้ใช้: ' + this.age.map(s => `${s.label} ${s.count.label} คน`).join(', ');
  }
}
