import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { ArtImageComponent } from '../../../shared/art-image/art-image.component';
import { AnalysisService, AnalysisStatus } from '../../../analysis.service';

const POLL_MS = 1500;
const LIMIT_MS = 60_000;

/**
 * กำลังประมวลผล (/analysis/processing/:id, ต้อง login): poll GET /status ทุก 1.5 วิ — ป้ายขั้นตอนมาจากสถานะจริงของ backend
 * DONE → ไปหน้าผลอัตโนมัติ; FAILED หรือเกิน 60 วิ → "วิเคราะห์ไม่สำเร็จ" + ลองใหม่ / กลับ.
 * "← ย้อนกลับ" กลับหน้า review โดยงานยังทำต่อที่ backend
 */
@Component({
  selector: 'app-analysis-processing',
  standalone: true,
  imports: [NavbarComponent, RouterLink, ArtImageComponent],
  templateUrl: './analysis-processing.component.html',
  styleUrls: ['../analysis-shared.css', './analysis-processing.component.css']
})
export class AnalysisProcessingComponent implements OnInit, OnDestroy {

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private analyses = inject(AnalysisService);
  private sub?: Subscription;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;

  readonly steps = ['ตรวจสอบอาหาร 5 หมู่', 'ตรวจสอบความเสี่ยง', 'สรุปผลและคำแนะนำ'];
  id = '';
  status: AnalysisStatus | null = null;
  failed = false;
  failMessage = '';
  notFound = false;
  retrying = false;

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.start();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /** 0 = ยังไม่ถึง, 1 = กำลังทำ, 2 = เสร็จ */
  stepState(i: number): number {
    const s = this.status;
    if (!s) return i === 0 ? 1 : 0;
    if (s.status === 'DONE') return 2;
    const current = Math.max(1, s.step);   // PENDING = กำลังเริ่มขั้นแรก
    return i + 1 < current ? 2 : i + 1 === current ? 1 : 0;
  }

  stepLabel(i: number): string {
    return ['ยังไม่ถึง', 'กำลังทำ', 'เสร็จแล้ว'][this.stepState(i)];
  }

  retry(): void {
    if (this.retrying) return;
    this.retrying = true;
    this.sub?.unsubscribe();
    this.sub = this.analyses.retry(this.id).subscribe({
      next: s => { this.retrying = false; this.status = s; this.start(); },
      error: () => { this.retrying = false; this.failMessage = 'ลองใหม่ไม่สำเร็จ กรุณากลับไปเริ่มวิเคราะห์อีกครั้ง'; }
    });
  }

  private start(): void {
    this.failed = false;
    this.failMessage = '';
    this.startedAt = Date.now();
    this.poll();
  }

  private poll(): void {
    this.stop();
    this.sub = this.analyses.status(this.id).subscribe({
      next: s => {
        this.status = s;
        if (s.status === 'DONE') {
          void this.router.navigate(['/analysis/result', this.id], { replaceUrl: true });
        } else if (s.status === 'FAILED') {
          this.fail(s.failureReason);
        } else {
          this.schedule();
        }
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) { this.notFound = true; return; }
        this.schedule();   // เครือข่ายสะดุด → poll ต่อจนครบเวลา
      }
    });
  }

  private schedule(): void {
    if (Date.now() - this.startedAt >= LIMIT_MS) {
      this.fail(null);
      return;
    }
    this.timer = setTimeout(() => this.poll(), POLL_MS);
  }

  private fail(reason: string | null): void {
    this.stop();
    this.failed = true;
    this.failMessage = reason ?? '';
  }

  private stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.sub?.unsubscribe();
  }
}
