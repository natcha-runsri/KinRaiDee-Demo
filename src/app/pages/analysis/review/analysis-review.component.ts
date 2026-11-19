import { MenuImageComponent } from '../../../shared/menu-image/menu-image.component';
import { Component, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { ArtImageComponent } from '../../../shared/art-image/art-image.component';
import { AuthService } from '../../../auth.service';
import { AnalysisConfig, AnalysisService, GROUP_CLASS, ReviewItem, ReviewView, shiftDate } from '../../../analysis.service';
import { formatThaiDate } from '../../../history.service';
import { AnalysisDialogComponent } from './analysis-dialog.component';
import { AddMealDialogComponent } from './add-meal-dialog.component';

const UNDO_MS = 5000;
const NOTE_MS = 3000;

/** text = ข้อความที่เห็น, detail = ชื่อเมนู (ผู้ใช้โปรแกรมอ่านหน้าจอได้ยินด้วย) */
interface Toast { text: string; detail: string; undoId: string | null; }

/**
 * ตรวจสอบเมนูที่บันทึก (/analysis/review, ต้อง login): รายการมื้อของวันที่เลือก (เวลาไทย) = เมนูที่ถูกใจ + ที่เพิ่มเอง − ที่ลบ,
 * มื้อ + หมู่อาหาร, ภาพรวม 5 หมู่ และปุ่มเปิด pop-up วิเคราะห์ (กดไม่ได้ถ้าไม่มีรายการ).
 * แก้รายการได้: ✕ "ไม่ได้กิน" (toast เลิกทำได้ 5 วินาที — ไม่ยกเลิกการถูกใจ), เปลี่ยนมื้อ, "+ เพิ่มเมนูที่กิน" (pop-up ค้นหา).
 * ทุกการแก้ backend คืนรายการของวันนั้นหลังแก้ → ภาพรวม/จำนวนอัปเดตจากผลนั้น (ลบ: เอาออกจากจอทันทีก่อน)
 */
@Component({
  selector: 'app-analysis-review',
  standalone: true,
  imports: [MenuImageComponent, NavbarComponent, RouterLink, ArtImageComponent, AnalysisDialogComponent, AddMealDialogComponent],
  templateUrl: './analysis-review.component.html',
  styleUrls: ['../analysis-shared.css', './analysis-review.component.css', './analysis-review-edit.css']
})
export class AnalysisReviewComponent implements OnInit, OnDestroy {

  private analyses = inject(AnalysisService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private host = inject(ElementRef<HTMLElement>);
  private subs = new Subscription();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  readonly groupClass = GROUP_CLASS;
  config: AnalysisConfig | null = null;
  dates: { value: string; label: string }[] = [];
  date = '';

  review: ReviewView | null = null;
  loading = true;
  loadError = false;
  dialogOpen = false;
  addOpen = false;
  /** คำขอแก้รายการที่ยังไม่เสร็จ (ระหว่างนี้กดวิเคราะห์ไม่ได้) */
  pending = 0;
  toast: Toast | null = null;
  editError = '';

  ngOnInit(): void {
    this.subs.add(this.analyses.config().subscribe({
      next: c => {
        this.config = c;
        this.date = c.today;
        this.dates = Array.from({ length: c.reviewDays }, (_, i) => {
          const value = shiftDate(c.today, -i);
          return { value, label: i === 0 ? 'วันนี้' : i === 1 ? 'เมื่อวาน' : formatThaiDate(value) };
        });
        this.load();
      },
      error: () => { this.loading = false; this.loadError = true; }
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  onDateChange(value: string): void {
    this.date = value;
    this.hideToast();
    this.editError = '';
    this.load();
  }

  get dayWord(): string {
    return this.review?.today ? 'วันนี้' : 'วันที่ ' + formatThaiDate(this.review?.date ?? this.date);
  }

  get manualLeft(): number {
    return this.review ? Math.max(0, this.review.manualLimit - this.review.manualCount) : 0;
  }

  label(key: string): string {
    return this.config?.foodGroups.find(g => g.key === key)?.label ?? key;
  }

  openDialog(): void {
    if (this.review?.count && !this.pending) this.dialogOpen = true;
  }

  onStarted(id: string): void {
    this.dialogOpen = false;
    void this.router.navigate(['/analysis/processing', id]);
  }

  // ---------- แก้รายการ ----------

  /** ✕ "ไม่ได้กิน" → หายทันที + toast เลิกทำได้ 5 วินาที */
  remove(item: ReviewItem, index: number): void {
    if (!this.review) return;
    const date = this.review.date;
    this.review = { ...this.review, items: this.review.items.filter(i => i.id !== item.id), count: this.review.count - 1 };
    this.focusAfterRemove(index);
    this.showToast({ text: 'ลบแล้ว', detail: item.name, undoId: item.id }, UNDO_MS);
    this.edit(date, this.analyses.removeMeal(item.id));
  }

  undo(): void {
    const id = this.toast?.undoId;
    if (!id || !this.review) return;
    this.hideToast();
    this.edit(this.review.date, this.analyses.updateMeal(id, { excluded: false }));
  }

  changeSlot(item: ReviewItem, select: HTMLSelectElement): void {
    if (!this.review || select.value === item.mealSlot) return;
    // ไม่สำเร็จ (เช่น มีเมนูนี้ในมื้อนั้นแล้ว) → dropdown กลับเป็นมื้อเดิม (ค่าที่ bind ไม่เปลี่ยน Angular จึงไม่ตั้งให้เอง)
    this.edit(this.review.date, this.analyses.updateMeal(item.id, { mealSlot: select.value }), () => select.value = item.mealSlot);
  }

  openAdd(): void {
    this.editError = '';
    this.addOpen = true;
  }

  onAdded(e: { review: ReviewView; name: string }): void {
    this.addOpen = false;
    if (e.review.date === this.date) this.review = e.review;
    this.showToast({ text: 'เพิ่มแล้ว', detail: e.name, undoId: null }, NOTE_MS);
  }

  hideToast(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = null;
    this.toast = null;
  }

  private edit(date: string, req: ReturnType<AnalysisService['removeMeal']>, onError?: () => void): void {
    this.editError = '';
    this.pending++;
    this.subs.add(req.subscribe({
      next: r => { this.pending--; if (r.date === this.date) this.review = r; },
      error: (err: HttpErrorResponse) => {
        this.pending--;
        const e = this.auth.toFormError(err);
        this.editError = Object.values(e.fields)[0] || e.message || 'แก้รายการไม่สำเร็จ กรุณาลองใหม่';
        onError?.();
        if (date === this.date) this.load(true);
      }
    }));
  }

  private showToast(t: Toast, ms: number): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = t;
    this.toastTimer = setTimeout(() => this.hideToast(), ms);
  }

  /** focus ไม่หลุดไปที่ body: ไปปุ่มลบของรายการถัดไป (ไม่มี → ปุ่มเพิ่มเมนู) */
  private focusAfterRemove(index: number): void {
    setTimeout(() => {
      const el = this.host.nativeElement as HTMLElement;
      const buttons = el.querySelectorAll<HTMLElement>('.rm-btn');
      (buttons[Math.min(index, buttons.length - 1)] ?? el.querySelector<HTMLElement>('.add-btn'))?.focus();
    });
  }

  private load(quiet = false): void {
    if (!quiet) this.loading = true;
    this.loadError = false;
    const date = this.date;
    this.subs.add(this.analyses.review(date).subscribe({
      next: r => { if (date === this.date) { this.review = r; this.loading = false; } },
      error: () => { if (date === this.date) { this.review = null; this.loading = false; this.loadError = true; } }
    }));
  }
}
