import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { BmiBadgeComponent } from '../../shared/bmi-badge/bmi-badge.component';
import { ProfileStateService } from './profile-state.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ArtImageComponent } from '../../shared/art-image/art-image.component';
import { DashboardTrendsComponent } from './dashboard-trends.component';
import { DashboardRange, DashboardService, DashboardView } from '../../dashboard.service';

/**
 * Dashboard (/profile/dashboard, ใน layout โปรไฟล์ — ต้อง login): สรุปผลโภชนาการจากผลวิเคราะห์ราย วัน / 7 วัน.
 * ช่วงเวลาเก็บใน URL (?range=7d) รีเฟรชแล้วอยู่ที่เดิม. ไม่มีข้อมูล → "-" (ห้ามแต่งตัวเลข);
 * ไม่เคยวิเคราะห์เลย → empty state ทั้งหน้า
 */
@Component({
  selector: 'app-profile-dashboard',
  standalone: true,
  imports: [RouterLink, ArtImageComponent, DashboardTrendsComponent, BmiBadgeComponent],
  templateUrl: './profile-dashboard.component.html',
  styleUrls: ['./profile-dashboard.component.css', './profile-dashboard-nutrients.css', './profile-dashboard-bmi.css']
})
export class ProfileDashboardComponent implements OnInit, OnDestroy {

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dashboards = inject(DashboardService);
  private profile = inject(ProfileStateService);
  /** การ์ด BMI ใช้ข้อมูลโปรไฟล์ที่ layout โหลดไว้แล้ว (GET /api/users/me → bmi) */
  readonly account = this.profile.account;
  private subs = new Subscription();
  private loadSub?: Subscription;

  readonly ranges: { value: DashboardRange; label: string }[] = [{ value: '1d', label: '1 วัน' }, { value: '7d', label: '7 วัน' }];
  readonly circumference = 2 * Math.PI * 34;

  range: DashboardRange = '1d';
  data: DashboardView | null = null;
  loading = true;
  loadError = false;

  ngOnInit(): void {
    this.subs.add(this.route.queryParamMap.subscribe(q => {
      const r = q.get('range');
      this.range = r === '7d' ? '7d' : '1d';
      this.load();
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.loadSub?.unsubscribe();
  }

  setRange(r: DashboardRange): void {
    if (r === this.range) return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { range: r === '1d' ? null : r }, replaceUrl: true });
  }

  get hasData(): boolean {
    return !!this.data && this.data.daysWithData > 0;
  }

  get rangeWord(): string {
    return this.range === '1d' ? 'ในวันนี้' : 'ใน 7 วันที่ผ่านมา';
  }

  get mealsLink(): { path: string; query: Record<string, string> | null } {
    return this.range === '1d' ? { path: '/analysis/review', query: null } : { path: '/history', query: { range: '7d' } };
  }

  num(v: number | null | undefined): string {
    if (v == null) return '-';
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  percentWidth(score: number | null, max: number): number {
    return score == null ? 0 : Math.max(0, Math.min(100, (score / (max || 100)) * 100));
  }

  dashOffset(percent: number | null): number {
    const p = percent == null ? 0 : Math.max(0, Math.min(100, percent)) / 100;
    return this.circumference * (1 - p);
  }

  dotTitle(d: { label: string; present: boolean; daysPresent: number }): string {
    if (this.range === '1d') return d.label + (d.present ? ' (มี)' : ' (ขาด)');
    return `${d.label}: มี ${d.daysPresent} จาก ${this.data?.daysWithData ?? 0} วัน`;
  }

  get dotsLabel(): string {
    const dots = this.data?.foodGroups?.dots ?? [];
    const has = dots.filter(d => d.present).map(d => d.label);
    const miss = dots.filter(d => !d.present).map(d => d.label);
    return [has.length ? 'มี: ' + has.join(', ') : '', miss.length ? 'ขาด: ' + miss.join(', ') : ''].filter(Boolean).join(' · ');
  }

  private load(): void {
    this.loadSub?.unsubscribe();
    this.loading = true;
    this.loadError = false;
    const range = this.range;
    this.loadSub = this.dashboards.get(range).subscribe({
      next: d => { if (range === this.range) { this.data = d; this.loading = false; } },
      error: () => { this.loading = false; this.loadError = true; }
    });
  }
}
