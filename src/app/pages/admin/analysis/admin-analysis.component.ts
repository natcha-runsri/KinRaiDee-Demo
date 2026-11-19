import { Component, DestroyRef, ElementRef, NgZone, ViewChild, effect, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AdminService, AnalysisOverview } from '../../../admin.service';
import { AdminRangeService } from '../admin-range.service';

interface Pt { x: number; y: number | null; label: string; date: string; }

const H = 220;
const PAD = { left: 36, right: 26, top: 12, bottom: 28 };
/** สีระดับคะแนนตาม tone ของ analysis-rules.yml (มีป้ายข้อความกำกับเสมอ) */
const LEVEL_COLORS: Record<string, string> = { EXCELLENT: '#1f7a4a', GOOD: '#3fa36b', FAIR: '#d39a1c', IMPROVE: '#c2414a' };

/**
 * ภาพรวมการวิเคราะห์ (/admin/analysis) — สถิติรวมไม่ระบุตัวตามช่วงวันที่บนหัวหน้า (GET /api/admin/analysis):
 * คะแนนเฉลี่ย 4 ด้าน, สัดส่วนระดับคะแนน, หมู่อาหารที่ขาดบ่อย, แนวโน้มคะแนนเฉลี่ยรายวัน (SVG — วันที่มีผู้ใช้น้อยกว่า 5 คน = เว้นว่าง)
 */
@Component({
  selector: 'app-admin-analysis',
  standalone: true,
  templateUrl: './admin-analysis.component.html',
  styleUrls: ['../admin-shared.css', './admin-analysis.component.css']
})
export class AdminAnalysisComponent {

  @ViewChild('plot') set plotRef(ref: ElementRef<HTMLElement> | undefined) {
    this.resize?.disconnect();
    if (ref && typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(e => {
        const w = Math.max(280, Math.round(e[0].contentRect.width));
        if (w !== this.width) this.zone.run(() => (this.width = w));
      });
      this.resize.observe(ref.nativeElement);
    }
  }

  private admin = inject(AdminService);
  private zone = inject(NgZone);
  readonly rangeState = inject(AdminRangeService);
  private sub?: Subscription;
  private resize?: ResizeObserver;

  readonly height = H;
  readonly pad = PAD;
  readonly ticks = [0, 25, 50, 75, 100];
  width = 640;
  active: number | null = null;
  showTable = false;

  data = signal<AnalysisOverview | null>(null);
  loading = signal(true);
  error = signal(false);

  constructor() {
    effect(() => {
      const r = this.rangeState.range();
      this.load(r.from, r.to);
    });
    inject(DestroyRef).onDestroy(() => { this.sub?.unsubscribe(); this.resize?.disconnect(); });
  }

  levelColor(key: string): string {
    return LEVEL_COLORS[key] ?? '#8d8280';
  }

  areaPercent(avg: number | null, max: number): number {
    return avg == null || !max ? 0 : Math.round((avg / max) * 100);
  }

  get hiddenLevels(): boolean {
    return (this.data()?.levels ?? []).some(l => l.count.value == null);
  }

  // ---------- กราฟ ----------

  get plotW(): number { return this.width - PAD.left - PAD.right; }
  get plotH(): number { return H - PAD.top - PAD.bottom; }

  y(v: number): number {
    return PAD.top + this.plotH * (1 - v / 100);
  }

  get pts(): Pt[] {
    const t = this.data()?.trend ?? [];
    const step = t.length > 1 ? this.plotW / (t.length - 1) : 0;
    return t.map((p, i) => ({
      x: PAD.left + (t.length > 1 ? i * step : this.plotW / 2),
      y: p.average.value == null ? null : this.y(p.average.value),
      label: p.average.label,
      date: p.date
    }));
  }

  /** เส้นเฉพาะวันที่ติดกันที่มีค่า */
  get path(): string {
    let d = '';
    let prev = false;
    for (const p of this.pts) {
      if (p.y == null) { prev = false; continue; }
      d += (prev ? ' L' : ' M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
      prev = true;
    }
    return d.trim();
  }

  get xLabels(): Pt[] {
    const all = this.pts;
    const every = Math.max(1, Math.ceil(all.length / (this.width < 480 ? 4 : 8)));
    return all.filter((_, i) => (all.length - 1 - i) % every === 0);
  }

  get colW(): number {
    const n = this.pts.length;
    return n > 1 ? this.plotW / (n - 1) : this.plotW;
  }

  get shownDays(): number {
    return this.pts.filter(p => p.y != null).length;
  }

  dm(iso: string): string {
    return new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
  }

  get summary(): string {
    const d = this.data();
    if (!d) return '';
    return `แนวโน้มคะแนนเฉลี่ยรายวัน ${d.trend.length} วัน: มีตัวเลข ${this.shownDays} วัน`
      + (this.shownDays < d.trend.length ? ' วันที่เหลือมีผู้ใช้น้อยกว่า 5 คนจึงไม่แสดง' : '');
  }

  retry(): void {
    const r = this.rangeState.range();
    this.load(r.from, r.to);
  }

  private load(from: string, to: string): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(false);
    this.sub = this.admin.analysis(from, to).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(true); }
    });
  }
}
