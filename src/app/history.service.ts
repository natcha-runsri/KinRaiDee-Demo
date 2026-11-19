import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

/** ช่วงเวลาของหน้าประวัติ — ค่าเริ่มต้น 7d */
export type HistoryRange = 'today' | '7d' | '30d' | 'all';

export const HISTORY_RANGES: { value: HistoryRange; label: string }[] = [
  { value: 'today', label: 'วันนี้' },
  { value: '7d', label: '7 วันล่าสุด' },
  { value: '30d', label: '30 วันล่าสุด' },
  { value: 'all', label: 'ทั้งหมด' }
];

/** GET /api/users/me/history/summary — ค่าที่ไม่มีข้อมูลเป็น null (แสดง "-") */
export interface HistorySummary {
  range: HistoryRange;
  rangeLabel: string;
  from: string | null;
  to: string;
  avgMealsPerDay: number | null;
  avgScore: number | null;
  maxScore: number;
}

/** หมู่อาหาร/สถานะ ส่งชื่อและโทนสีมาจาก backend (รองรับผลจาก LLM โดยไม่ต้องแก้หน้าเว็บ) */
export interface FoodGroupMark {
  key: string;
  label: string;
  present: boolean;
}

export interface AnalysisStatus {
  code: string;
  label: string;
  /** good | warn | bad | neutral */
  tone: string;
}

export interface AnalysisEntry {
  id: string;
  /** yyyy-mm-dd (เวลาไทย) */
  recordedDate: string;
  itemCount: number | null;
  foodGroups: FoodGroupMark[];
  score: number | null;
  maxScore: number;
  status: AnalysisStatus | null;
  note: string | null;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
}

/** GET /api/users/me/liked-recipes — เรียงจากถูกใจล่าสุด */
export interface LikedRecipe {
  recipe: { id: string; menuName: string; imageUrl: string | null };
  likedAt: string;
  /** ชื่อสั้นสำหรับการ์ด */
  displayName: string | null;
  /** ยังไม่มีโภชนาการรายเมนู → null (ซ่อน) */
  calories: string | null;
}

@Injectable({ providedIn: 'root' })
export class HistoryService {

  constructor(private http: HttpClient) {}

  summary(range: HistoryRange) {
    return this.http.get<HistorySummary>('/api/users/me/history/summary', { params: { range } });
  }

  analyses(range: HistoryRange, page: number) {
    return this.http.get<Page<AnalysisEntry>>('/api/users/me/history/analyses', { params: { range, page } });
  }

  liked(page: number, size: number) {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<Page<LikedRecipe>>('/api/users/me/liked-recipes', { params });
  }

  unlike(recipeId: string) {
    return this.http.delete<void>(`/api/recipes/${encodeURIComponent(recipeId)}/like`);
  }
}

/** "2026-09-24" → "24/09/2026" (วันที่เป็นเวลาไทยจาก backend แล้ว — ไม่แปลง timezone ซ้ำ) */
export function formatThaiDate(isoDate: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '-';
}
