import { Component, OnDestroy, computed, effect, inject, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { ArtImageComponent } from '../../../shared/art-image/art-image.component';
import { AuthService } from '../../../auth.service';
import { AnalysisService, LatestSummary } from '../../../analysis.service';
import { safeReturnUrl } from '../../../auth-return.service';
import { GuestEmptyStateComponent } from '../../../shared/guest-empty-state/guest-empty-state.component';

/**
 * หน้าแรกวิเคราะห์พฤติกรรมการกิน (/analysis) — ทุกคนเข้าได้.
 * ไม่ login → หน้าชวนเข้าสู่ระบบ (GuestEmptyState) และไม่เรียก API; หน้าย่อย /analysis/* ตอนไม่ login ถูกส่งมาที่นี่
 * พร้อม ?returnUrl=<หน้าเดิม> → ปุ่ม "เข้าสู่ระบบ"/"สมัครสมาชิก" พากลับไปหน้านั้น (ไม่มี → /analysis).
 * login → แถบรูป 5 หมู่ + "เริ่มต้นตรวจสอบ" (→ /analysis/review) + การ์ดสรุป (คะแนนล่าสุด + ผลต่างจากครั้งก่อน,
 * เมนูที่บันทึกวันนี้) — ไม่มีผล → ข้อความว่าง (ไม่แต่งตัวเลข)
 */
@Component({
  selector: 'app-analysis',
  standalone: true,
  imports: [NavbarComponent, RouterLink, ArtImageComponent, GuestEmptyStateComponent],
  templateUrl: './analysis.component.html',
  // มือถือ (≤ 767px) แยกไฟล์ (budget CSS ต่อไฟล์ 8kB)
  styleUrls: ['./analysis.component.css', './analysis-mobile.css']
})
export class AnalysisComponent implements OnDestroy {

  private auth = inject(AuthService);
  private analyses = inject(AnalysisService);
  private sub?: Subscription;

  readonly loggedIn = computed(() => !!this.auth.currentUser());
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);
  /** หลัง login กลับไป: returnUrl ที่เป็นหน้าในส่วนวิเคราะห์เท่านั้น ไม่งั้น /analysis */
  readonly guestReturnUrl = computed(() => {
    const url = safeReturnUrl(this.query()?.get('returnUrl'), '/analysis');
    return url === '/analysis' || url.startsWith('/analysis/') || url.startsWith('/analysis?') ? url : '/analysis';
  });
  readonly groupImages = [
    { key: 'protein', alt: 'หมู่ 1 เนื้อสัตว์ ไข่ นม ถั่ว' },
    { key: 'carb', alt: 'หมู่ 2 ข้าว แป้ง' },
    { key: 'mineral', alt: 'หมู่ 3 ผัก' },
    { key: 'vitamin', alt: 'หมู่ 4 ผลไม้' },
    { key: 'fat', alt: 'หมู่ 5 ไขมัน' }
  ];

  summary: LatestSummary | null = null;
  loadError = false;

  /** วงกลม donut: เส้นรอบวง r=40 */
  readonly circumference = 2 * Math.PI * 40;

  constructor() {
    effect(() => {
      if (this.loggedIn()) untracked(() => this.load());
      else this.summary = null;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  dashOffset(score: number, max: number): number {
    return this.circumference * (1 - Math.max(0, Math.min(1, score / (max || 100))));
  }

  get tone(): string {
    return this.summary?.latest?.level?.tone ?? 'good';
  }

  private load(): void {
    this.sub?.unsubscribe();
    this.loadError = false;
    this.sub = this.analyses.latestSummary().subscribe({
      next: s => this.summary = s,
      error: () => this.loadError = true
    });
  }
}
