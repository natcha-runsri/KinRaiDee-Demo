import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { MenuImageComponent } from '../../shared/menu-image/menu-image.component';
import { DashboardService, TrendDays, TrendPoint, TrendsView } from '../../dashboard.service';

interface Pt { p: TrendPoint; x: number; y: number | null; }

const H = 220;
const PAD = { left: 34, right: 14, top: 12, bottom: 28 };

/**
 * "แนวโน้มของคุณ" (Dashboard): กราฟเส้นคะแนนรายวัน (SVG เขียนเอง — ไม่ใช้ไลบรารีกราฟ) + หมู่อาหารที่ขาดบ่อยที่สุด + เมนูแนะนำ.
 * ช่วง 7 / 30 วันของส่วนนี้เอง (แยกจาก 1 วัน / 7 วัน ด้านบน). วันที่ไม่มีผลวิเคราะห์ = เว้นว่าง (เส้นขาด ไม่นับเป็น 0).
 * จุดบนกราฟกด/Enter → หน้าผลวิเคราะห์ของวันนั้น; tooltip ตอนชี้/โฟกัส. screen reader: ข้อความสรุป + ตารางข้อมูลซ่อน
 */
@Component({
  selector: 'app-dashboard-trends',
  standalone: true,
  imports: [RouterLink, MenuImageComponent],
  templateUrl: './dashboard-trends.component.html',
  styleUrl: './dashboard-trends.component.css'
})
export class DashboardTrendsComponent implements OnInit, OnDestroy {

  /** กล่องกราฟอยู่ใน @if — ติดตามขนาดเมื่อ element เกิด (setTimeout หลังโหลดเร็วกว่า CD เพราะ eventCoalescing) */
  @ViewChild('plot') set plotRef(ref: ElementRef<HTMLElement> | undefined) {
    this.resize?.disconnect();
    this.resize = undefined;
    if (ref) this.observe(ref.nativeElement);
  }

  private dashboards = inject(DashboardService);
  private router = inject(Router);
  private zone = inject(NgZone);
  private sub?: Subscription;
  private resize?: ResizeObserver;

  readonly options: { value: TrendDays; label: string }[] = [{ value: 7, label: '7 วัน' }, { value: 30, label: '30 วัน' }];
  readonly height = H;
  readonly pad = PAD;
  readonly ticks = [0, 20, 40, 60, 80, 100];

  days: TrendDays = 7;
  data: TrendsView | null = null;
  loading = true;
  loadError = false;
  width = 640;
  active: Pt | null = null;

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.resize?.disconnect();
  }

  setDays(d: TrendDays): void {
    if (d === this.days) return;
    this.days = d;
    this.load();
  }

  // ---------- กราฟ ----------

  get plotW(): number {
    return this.width - PAD.left - PAD.right;
  }

  get plotH(): number {
    return H - PAD.top - PAD.bottom;
  }

  y(score: number): number {
    return PAD.top + this.plotH * (1 - score / (this.data?.maxScore || 100));
  }

  get pts(): Pt[] {
    const ps = this.data?.points ?? [];
    const step = ps.length > 1 ? this.plotW / (ps.length - 1) : 0;
    return ps.map((p, i) => ({ p, x: PAD.left + (ps.length > 1 ? i * step : this.plotW / 2), y: p.score == null ? null : this.y(p.score) }));
  }

  /** เส้นเฉพาะวันที่ติดกันที่มีข้อมูล — วันไม่มีข้อมูลทำให้เส้นขาด */
  get path(): string {
    let d = '';
    let prev: Pt | null = null;
    for (const pt of this.pts) {
      if (pt.y == null) { prev = null; continue; }
      d += (prev ? ' L' : ' M') + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1);
      prev = pt;
    }
    return d.trim();
  }

  /** ป้ายแกน X: 7 วัน = ทุกวัน, 30 วัน = ทุก 5 วัน (จอแคบ ทุก 7 วัน) + วันสุดท้าย */
  get xLabels(): Pt[] {
    const all = this.pts;
    const every = this.days === 7 ? (this.width < 420 ? 2 : 1) : this.width < 520 ? 7 : 5;
    return all.filter((_, i) => (all.length - 1 - i) % every === 0);
  }

  bandY(b: { from: number; to: number }): { y: number; h: number } {
    const top = this.y(Math.min(100, b.to + (b.to < 100 ? 1 : 0)));
    return { y: top, h: this.y(b.from) - top };
  }

  dm(iso: string): string {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  }

  tip(p: TrendPoint): string {
    return `${this.dm(p.date)} · ${p.score} คะแนน` + (p.level ? ` (${p.level.label})` : '');
  }

  open(pt: Pt): void {
    if (pt.p.analysisId) void this.router.navigate(['/analysis/result', pt.p.analysisId]);
  }

  // ---------- ข้อความสรุป ----------

  get changeText(): string | null {
    const c = this.data?.changeFromPrevious;
    if (c == null) return null;
    if (c === 0) return 'เท่ากับช่วงก่อนหน้า';
    return `${c > 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(c)} คะแนนจากช่วงก่อนหน้า`;
  }

  get srSummary(): string {
    const d = this.data;
    if (!d || d.average == null) return '';
    const scored = d.points.filter(p => p.score != null);
    const best = scored.reduce((a, b) => (b.score! > a.score! ? b : a), scored[0]);
    const worst = scored.reduce((a, b) => (b.score! < a.score! ? b : a), scored[0]);
    return `กราฟคะแนนพฤติกรรมการกิน ${this.days} วันล่าสุด: มีผลวิเคราะห์ ${d.recordedDays} วัน เฉลี่ย ${d.average} คะแนน`
      + (this.changeText ? ` ${this.changeText}` : '')
      + ` สูงสุด ${best.score} คะแนน วันที่ ${this.dm(best.date)} ต่ำสุด ${worst.score} คะแนน วันที่ ${this.dm(worst.date)}`;
  }

  missPercent(n: number, of: number): number {
    return of ? Math.round((n / of) * 100) : 0;
  }

  // ---------- โหลด / ขนาด ----------

  private load(): void {
    this.sub?.unsubscribe();
    this.loading = true;
    this.loadError = false;
    this.active = null;
    const days = this.days;
    this.sub = this.dashboards.trends(days).subscribe({
      next: t => {
        if (days !== this.days) return;
        this.data = t;
        this.loading = false;
      },
      error: () => { this.loading = false; this.loadError = true; }
    });
  }

  /** ความกว้างกราฟตามกล่องจริง (ตัวอักษรไม่ย่อตามจอ) */
  private observe(el: HTMLElement): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resize = new ResizeObserver(entries => {
      const w = Math.max(260, Math.round(entries[0].contentRect.width));
      if (w !== this.width) this.zone.run(() => this.width = w);
    });
    this.resize.observe(el);
  }
}
