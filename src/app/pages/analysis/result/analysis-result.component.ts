import { MenuImageComponent } from '../../../shared/menu-image/menu-image.component';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { AnalysisResult, AnalysisService, GROUP_CLASS, SCORE_ICON_SRC } from '../../../analysis.service';
import { formatThaiDate } from '../../../history.service';

/**
 * ผลการวิเคราะห์ (/analysis/result/:id, ต้อง login): หมู่ที่ขาด, ข้อมูลผู้ใช้ + BMI, คะแนน 4 ด้าน, คำแนะนำ (LLM/template),
 * เมนูแนะนำ 8 เมนู. ผลของคนอื่น / ไม่มี → "ไม่พบผลการวิเคราะห์" (backend ตอบ 404); ยังไม่เสร็จ → กลับหน้า processing
 */
@Component({
  selector: 'app-analysis-result',
  standalone: true,
  imports: [MenuImageComponent, NavbarComponent, RouterLink],
  templateUrl: './analysis-result.component.html',
  styleUrls: ['../analysis-shared.css', './analysis-result.component.css', './analysis-result-sections.css']
})
export class AnalysisResultComponent implements OnInit, OnDestroy {

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private analyses = inject(AnalysisService);
  private sub?: Subscription;

  readonly groupClass = GROUP_CLASS;
  readonly scoreIconSrc = SCORE_ICON_SRC;
  /** key ของไอคอนคะแนนที่รูปโหลดไม่ได้ → แสดง emoji เดิม */
  readonly brokenScoreIcons = new Set<string>();
  readonly circumference = 2 * Math.PI * 40;
  result: AnalysisResult | null = null;
  loading = true;
  notFound = false;
  loadError = false;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.sub = this.analyses.result(id).subscribe({
      next: r => {
        if (r.status !== 'DONE') {
          void this.router.navigate(['/analysis/processing', id], { replaceUrl: true });
          return;
        }
        this.result = r;
        this.loading = false;
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        if (err.status === 404 || err.status === 400) this.notFound = true; else this.loadError = true;
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  get dayWord(): string {
    if (!this.result) return '';
    return this.result.date === this.todayIso() ? 'วันนี้' : 'วันที่ ' + formatThaiDate(this.result.date);
  }

  get missingMarks() {
    return this.result?.foodGroups.filter(g => !g.present) ?? [];
  }

  get tone(): string {
    return this.result?.scores?.level?.tone ?? 'good';
  }

  dashOffset(score: number, max: number): number {
    return this.circumference * (1 - Math.max(0, Math.min(1, score / (max || 100))));
  }

  percent(score: number, max: number): number {
    return Math.round(Math.max(0, Math.min(1, score / (max || 1))) * 100);
  }

  /** ทศนิยม .0 ไม่แสดง */
  num(v: number | null | undefined): string {
    if (v == null) return '-';
    return Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(1);
  }

  private todayIso(): string {
    const d = new Date(Date.now() + 7 * 3600_000);   // เวลาไทย
    return d.toISOString().slice(0, 10);
  }
}
