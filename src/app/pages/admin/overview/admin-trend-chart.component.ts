import { Component, ElementRef, Input, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import { Metric, OverviewTrendPoint } from '../../../admin.service';

type SeriesKey = 'newUsers' | 'analyses' | 'recommendations';

interface Series { key: SeriesKey; label: string; color: string; }
interface Pt { x: number; y: number; hidden: boolean; metric: Metric; }

const H = 260;
const PAD = { left: 44, right: 16, top: 14, bottom: 30 };
/** ค่าที่ถูกซ่อน (น้อยกว่า 5) วางกลางแถบ 0–5 แบบจุดกลวง + เส้นประ — ไม่ใช่ค่าจริง */
const HIDDEN_Y = 2.5;

/**
 * แนวโน้มการใช้งานรายวัน (SVG เขียนเอง แบบเดียวกับ Dashboard ผู้ใช้): ผู้ใช้ใหม่ / การวิเคราะห์ / จำนวนครั้งที่แนะนำ.
 * สี 3 เส้นผ่าน validator (CVD) — ต่างจาก mockup ที่ใช้เขียว (ชมพู-เขียวแยกไม่ออกสำหรับตาบอดสี).
 * ชี้/แตะคอลัมน์ = เส้นแนว + tooltip, มีตารางข้อมูล (ปุ่ม "ดูเป็นตาราง")
 */
@Component({
  selector: 'app-admin-trend-chart',
  standalone: true,
  templateUrl: './admin-trend-chart.component.html',
  styleUrls: ['../admin-shared.css', './admin-trend-chart.component.css']
})
export class AdminTrendChartComponent implements OnDestroy {

  @Input() points: OverviewTrendPoint[] = [];

  @ViewChild('plot') set plotRef(ref: ElementRef<HTMLElement> | undefined) {
    this.resize?.disconnect();
    if (ref) this.observe(ref.nativeElement);
  }

  private zone = inject(NgZone);
  private resize?: ResizeObserver;

  readonly series: Series[] = [
    { key: 'newUsers', label: 'ผู้ใช้ใหม่', color: '#e8566a' },
    { key: 'analyses', label: 'การวิเคราะห์', color: '#1e5fb8' },
    { key: 'recommendations', label: 'ครั้งที่แนะนำ', color: '#c27c0e' }
  ];
  readonly height = H;
  readonly pad = PAD;
  width = 640;
  active: number | null = null;
  showTable = false;

  ngOnDestroy(): void {
    this.resize?.disconnect();
  }

  get plotW(): number { return this.width - PAD.left - PAD.right; }
  get plotH(): number { return H - PAD.top - PAD.bottom; }

  /** ค่าสูงสุดของแกน: ปัดขึ้นเป็นตัวเลขสวย อย่างน้อย 5 */
  get yMax(): number {
    let max = 5;
    for (const p of this.points) for (const s of this.series) max = Math.max(max, p[s.key].value ?? 0);
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= max) return m * mag;
    return 10 * mag;
  }

  get ticks(): number[] {
    const max = this.yMax;
    return [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(max * f * 10) / 10);
  }

  y(v: number): number {
    return PAD.top + this.plotH * (1 - v / this.yMax);
  }

  x(i: number): number {
    const n = this.points.length;
    return PAD.left + (n > 1 ? (i * this.plotW) / (n - 1) : this.plotW / 2);
  }

  get bandTop(): number { return this.y(5); }
  get bandH(): number { return this.y(0) - this.y(5); }

  pts(key: SeriesKey): Pt[] {
    return this.points.map((p, i) => {
      const m = p[key];
      return { x: this.x(i), y: this.y(m.value ?? HIDDEN_Y), hidden: m.value == null, metric: m };
    });
  }

  /** เส้นทึบ = ทั้งสองจุดมีค่าจริง; เส้นประ = มีจุดที่ถูกซ่อน */
  path(key: SeriesKey, dashed: boolean): string {
    const ps = this.pts(key);
    let d = '';
    for (let i = 1; i < ps.length; i++) {
      const a = ps[i - 1], b = ps[i];
      if ((a.hidden || b.hidden) !== dashed) continue;
      d += ` M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    return d.trim();
  }

  area(key: SeriesKey): string {
    const ps = this.pts(key);
    if (ps.length < 2) return '';
    const base = this.y(0).toFixed(1);
    return `M${ps[0].x.toFixed(1)} ${base} ` + ps.map(p => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
      + ` L${ps[ps.length - 1].x.toFixed(1)} ${base} Z`;
  }

  /** ป้ายแกน X ไม่เกิน ~8 ป้าย (จอแคบน้อยลง) + วันสุดท้ายเสมอ */
  get xLabels(): { x: number; text: string }[] {
    const n = this.points.length;
    const maxLabels = this.width < 480 ? 4 : 8;
    const every = Math.max(1, Math.ceil(n / maxLabels));
    return this.points
      .map((p, i) => ({ i, p }))
      .filter(({ i }) => (n - 1 - i) % every === 0)
      .map(({ i, p }) => ({ x: this.x(i), text: this.dm(p.date) }));
  }

  get colW(): number {
    const n = this.points.length;
    return n > 1 ? this.plotW / (n - 1) : this.plotW;
  }

  dm(iso: string): string {
    return new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', timeZone: 'UTC' })
      .format(new Date(iso + 'T00:00:00Z'));
  }

  get tipLeft(): number {
    if (this.active == null) return 0;
    const x = this.x(this.active);
    return Math.min(Math.max(x - 90, 0), this.width - 180);
  }

  get anyHidden(): boolean {
    return this.points.some(p => this.series.some(s => p[s.key].value == null));
  }

  get summary(): string {
    if (!this.points.length) return '';
    const total = (k: SeriesKey) => this.points.reduce((n, p) => n + (p[k].value ?? 0), 0);
    return `กราฟแนวโน้มรายวัน ${this.points.length} วัน: ` + this.series
      .map(s => `${s.label} รวมเฉพาะวันที่แสดงตัวเลข ${total(s.key).toLocaleString('th-TH')}`).join(', ')
      + (this.anyHidden ? ' — บางวันมีผู้ใช้น้อยกว่า 5 คนจึงไม่แสดงตัวเลข' : '');
  }

  private observe(el: HTMLElement): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resize = new ResizeObserver(entries => {
      const w = Math.max(280, Math.round(entries[0].contentRect.width));
      if (w !== this.width) this.zone.run(() => (this.width = w));
    });
    this.resize.observe(el);
  }
}
