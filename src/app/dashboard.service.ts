import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export type DashboardRange = '1d' | '7d';

export interface DashboardBadge { label: string; tone: 'good' | 'warn' | 'bad' | 'low' | string; }

/** GET /api/users/me/dashboard — ค่าที่ไม่มีข้อมูลเป็น null (แสดง "-") */
export interface DashboardView {
  range: DashboardRange;
  rangeLabel: string;
  from: string;
  to: string;
  /** เคยวิเคราะห์สำเร็จอย่างน้อย 1 ครั้ง — false = empty state ทั้งหน้า */
  hasAnyAnalysis: boolean;
  daysWithData: number;
  score: number | null;
  maxScore: number;
  level: DashboardBadge | null;
  foodGroups: { count: number; max: number;
                dots: { key: string; label: string; present: boolean; daysPresent: number }[] } | null;
  groupStatus: DashboardBadge | null;
  mealCount: number | null;
  /** วาดตามที่ได้รับ — สลับเป็นปริมาณสารอาหารจริงได้โดยไม่ต้องแก้หน้าเว็บ */
  nutrients: { key: string; label: string; percent: number | null; detailText: string; status: DashboardBadge | null }[];
  nutrientBasis: string;
  nutrientNote: string | null;
  latestAnalysisId: string | null;
  advice: string | null;
  adviceSource: string | null;
}

export type TrendDays = 7 | 30;

/** 1 วันในช่วง — ไม่มีผลวิเคราะห์ → score/analysisId/level = null (กราฟเว้นว่าง) */
export interface TrendPoint {
  date: string;
  score: number | null;
  analysisId: string | null;
  level: { code: string; label: string; tone: string } | null;
}

export interface TrendMissingGroup {
  key: string; label: string; labelWithExample: string; missedDays: number; recordedDays: number;
}

/** GET /api/users/me/dashboard/trends?days=7|30 */
export interface TrendsView {
  days: TrendDays;
  from: string;
  to: string;
  maxScore: number;
  points: TrendPoint[];
  recordedDays: number;
  /** มีผลวิเคราะห์อย่างน้อย 2 วัน */
  enough: boolean;
  average: number | null;
  /** เทียบช่วงก่อนหน้าที่ยาวเท่ากัน — ช่วงก่อนไม่มีข้อมูล = null */
  changeFromPrevious: number | null;
  /** แถบสีพื้นหลังกราฟ (good ≥80, fair 60–79, low) */
  bands: { from: number; to: number; tone: 'good' | 'fair' | 'low' | string; label: string | null }[];
  missingGroups: TrendMissingGroup[];
  mostMissedGroup: TrendMissingGroup | null;
  recommendations: { id: string; name: string; menuName: string; imageUrl: string | null; foodGroups: string[] }[];
}

@Injectable({ providedIn: 'root' })
export class DashboardService {

  constructor(private http: HttpClient) {}

  get(range: DashboardRange) {
    return this.http.get<DashboardView>('/api/users/me/dashboard', { params: { range } });
  }

  trends(days: TrendDays) {
    return this.http.get<TrendsView>('/api/users/me/dashboard/trends', { params: { days } });
  }
}
