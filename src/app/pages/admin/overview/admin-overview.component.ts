import { Component, DestroyRef, ElementRef, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AdminService, Activity, Overview, OverviewCard } from '../../../admin.service';
import { MenuImageComponent } from '../../../shared/menu-image/menu-image.component';
import { AdminRangeService, thDate } from '../admin-range.service';
import { AdminTrendChartComponent } from './admin-trend-chart.component';
import { AdminDemographicsComponent } from './admin-demographics.component';

interface CardView { key: string; title: string; tone: string; card: OverviewCard; unit?: string; }

const TH_TIME = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

/**
 * หน้าหลักแอดมิน (/admin) ตาม mockup — ข้อมูลจริงจาก GET /api/admin/overview ตามช่วงวันที่บนหัวหน้า.
 * แทนตาราง "ผู้ใช้ที่มีคะแนนสูงสุด" ด้วยการ์ด "สถานะข้อมูล" (อ่านอย่างเดียว); ?focus=data-status (จากกระดิ่ง) เลื่อนไปการ์ดนั้น
 */
@Component({
  selector: 'app-admin-overview',
  standalone: true,
  imports: [RouterLink, MenuImageComponent, AdminTrendChartComponent, AdminDemographicsComponent],
  templateUrl: './admin-overview.component.html',
  styleUrls: ['../admin-shared.css', './admin-overview.component.css', './admin-overview-side.css']
})
export class AdminOverviewComponent {

  private admin = inject(AdminService);
  private route = inject(ActivatedRoute);
  private host = inject(ElementRef<HTMLElement>);
  readonly rangeState = inject(AdminRangeService);
  private sub?: Subscription;

  data = signal<Overview | null>(null);
  loading = signal(true);
  error = signal(false);

  constructor() {
    effect(() => {
      const r = this.rangeState.range();
      this.load(r.from, r.to);
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  get cards(): CardView[] {
    const c = this.data()?.cards;
    if (!c) return [];
    return [
      { key: 'users', title: 'ผู้ใช้ทั้งหมด', tone: 'pink', card: c.users },
      { key: 'analyses', title: 'การวิเคราะห์ทั้งหมด', tone: 'green', card: c.analyses },
      { key: 'recommendations', title: 'จำนวนครั้งที่แนะนำ', tone: 'orange', card: c.recommendations },
      { key: 'score', title: 'คะแนนเฉลี่ย', tone: 'purple', card: c.averageScore, unit: '/ 100' }
    ];
  }

  changeText(c: OverviewCard): string {
    if (c.isNew) return 'ช่วงก่อนหน้าไม่มีข้อมูล';
    if (c.changePercent == null) return 'เทียบช่วงก่อนไม่ได้ (ผู้ใช้น้อยกว่า 5 คน)';
    if (c.changePercent === 0) return 'เท่ากับช่วงก่อนหน้า';
    const v = Math.abs(c.changePercent).toLocaleString('th-TH', { maximumFractionDigits: 1 });
    return `${v}% จากช่วงก่อนหน้า`;
  }

  direction(c: OverviewCard): 'up' | 'down' | 'flat' | 'new' | null {
    if (c.isNew) return 'new';
    if (c.changePercent == null) return null;
    return c.changePercent > 0 ? 'up' : c.changePercent < 0 ? 'down' : 'flat';
  }

  get previousLabel(): string {
    const d = this.data();
    return d ? `ช่วงก่อนหน้า: ${thDate(d.previousFrom)} - ${thDate(d.previousTo)}` : '';
  }

  when(a: Activity): string {
    if (a.at) return TH_TIME.format(new Date(a.at)) + ' น.';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    return a.date === today ? 'วันนี้' : thDate(a.date);
  }

  dateTime(iso: string | null): string {
    if (!iso) return '-';
    const d = new Date(iso);
    return new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(d);
  }

  daysAgo(iso: string | null): string {
    if (!iso) return '';
    const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
    return days <= 0 ? 'วันนี้' : `${days} วันที่แล้ว`;
  }

  retry(): void {
    const r = this.rangeState.range();
    this.load(r.from, r.to);
  }

  private load(from: string, to: string): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(false);
    this.sub = this.admin.overview(from, to).subscribe({
      next: d => {
        this.data.set(d);
        this.loading.set(false);
        if (this.route.snapshot.queryParamMap.get('focus') === 'data-status') {
          setTimeout(() => this.host.nativeElement.querySelector('#data-status')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }
      },
      error: () => { this.loading.set(false); this.error.set(true); }
    });
  }
}
