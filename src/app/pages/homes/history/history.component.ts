import { Component, OnDestroy, computed, effect, inject, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { AuthService } from '../../../auth.service';
import {
  AnalysisEntry, HISTORY_RANGES, HistoryRange, HistoryService, HistorySummary, LikedRecipe, Page, formatThaiDate
} from '../../../history.service';
import { LikedCardComponent } from './liked-card.component';
import { GuestEmptyStateComponent } from '../../../shared/guest-empty-state/guest-empty-state.component';

const LIKED_PREVIEW = 5;

/**
 * หน้าประวัติการใช้งาน (/history) — ทุกคนเข้าได้.
 * ไม่ login → หน้าชวนเข้าสู่ระบบ (ไม่เรียก API ประวัติ). login → การ์ดสรุป + เมนูที่ถูกใจ 5 รายการล่าสุด + ประวัติการวิเคราะห์.
 * แสดงเฉพาะข้อมูลจริง: ไม่มีข้อมูล → "-" / empty state ของส่วนนั้น (ห้ามใส่ตัวเลขตัวอย่าง).
 */
@Component({
  selector: 'app-history',
  standalone: true,
  imports: [NavbarComponent, RouterLink, LikedCardComponent, GuestEmptyStateComponent],
  templateUrl: './history.component.html',
  styleUrls: ['./history.component.css', './history-sections.css']
})
export class HistoryComponent implements OnDestroy {

  private auth = inject(AuthService);
  private history = inject(HistoryService);
  private route = inject(ActivatedRoute);

  readonly loggedIn = computed(() => !!this.auth.currentUser());
  readonly ranges = HISTORY_RANGES;
  readonly formatDate = formatThaiDate;

  range: HistoryRange = '7d';

  summary: HistorySummary | null = null;
  summaryError = false;

  liked: LikedRecipe[] = [];
  likedLoading = true;
  likedError = false;

  analyses: Page<AnalysisEntry> | null = null;
  analysesLoading = true;
  analysesError = false;

  /** รูปประกอบที่ยังไม่มีไฟล์ → placeholder */
  missingArt = new Set<string>();

  private subs = new Subscription();

  constructor() {
    // ?range= จากลิงก์ภายนอก (เช่น Dashboard "รายละเอียด" → /history?range=7d)
    const r = this.route.snapshot.queryParamMap.get('range');
    if (r && HISTORY_RANGES.some(x => x.value === r)) this.range = r as HistoryRange;
    // login/logout บนหน้านี้ (dropdown navbar) → สลับเนื้อหาทันที; ไม่ login ไม่เรียก API
    effect(() => {
      if (this.loggedIn()) untracked(() => this.loadAll());
    });
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  onRangeChange(value: string): void {
    this.range = value as HistoryRange;
    this.loadSummary();
    this.loadAnalyses(0);
  }

  // ---------- การ์ดสรุป ----------

  /** "7 วันล่าสุด" → ["7 วัน", "ล่าสุด"] ตาม mockup; "วันนี้"/"ทั้งหมด" → บรรทัดเดียว */
  get rangeParts(): [string, string] {
    const label = this.summary?.rangeLabel ?? this.ranges.find(r => r.value === this.range)!.label;
    const m = /^(.*\S)\s*(ล่าสุด)$/.exec(label);
    return m ? [m[1], m[2]] : [label, ''];
  }

  formatNumber(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  // ---------- ประวัติการวิเคราะห์ ----------

  groupsLabel(groups: { label: string; present: boolean }[]): string {
    const has = groups.filter(g => g.present).map(g => g.label);
    const miss = groups.filter(g => !g.present).map(g => g.label);
    return [has.length ? 'มี: ' + has.join(', ') : '', miss.length ? 'ขาด: ' + miss.join(', ') : '']
      .filter(Boolean).join(' · ') || 'ไม่มีข้อมูลหมู่อาหาร';
  }

  toneClass(tone: string | undefined): string {
    return ['good', 'warn', 'bad'].includes(tone ?? '') ? 'tone-' + tone : 'tone-neutral';
  }

  goPage(p: number): void {
    if (!this.analyses || p < 0 || p >= this.analyses.totalPages) return;
    this.loadAnalyses(p);
  }

  // ---------- โหลดข้อมูล ----------

  private loadAll(): void {
    this.loadSummary();
    this.loadLiked();
    this.loadAnalyses(0);
  }

  private loadSummary(): void {
    this.summaryError = false;
    this.subs.add(this.history.summary(this.range).subscribe({
      next: s => { if (s.range === this.range) this.summary = s; },
      error: () => { this.summary = null; this.summaryError = true; }
    }));
  }

  private loadLiked(): void {
    this.likedLoading = true;
    this.likedError = false;
    this.subs.add(this.history.liked(0, LIKED_PREVIEW).subscribe({
      next: p => { this.liked = p.content; this.likedLoading = false; },
      error: () => { this.liked = []; this.likedLoading = false; this.likedError = true; }
    }));
  }

  private loadAnalyses(page: number): void {
    const range = this.range;
    this.analysesLoading = true;
    this.analysesError = false;
    this.subs.add(this.history.analyses(range, page).subscribe({
      next: p => { if (range === this.range) { this.analyses = p; this.analysesLoading = false; } },
      error: () => { if (range === this.range) { this.analyses = null; this.analysesLoading = false; this.analysesError = true; } }
    }));
  }
}
