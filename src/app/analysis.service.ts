import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/** อาหารหลัก 5 หมู่ (key ใช้ทั้งระบบ) */
export type FoodGroupKey = 'protein' | 'carb' | 'mineral' | 'vitamin' | 'fat';
export type AnalysisGender = 'male' | 'female' | 'other';

export interface GroupInfo { key: FoodGroupKey; label: string; example: string; }
export interface GroupMark { key: FoodGroupKey; label: string; present: boolean; }
export interface LevelInfo { code: string; label: string; tone: 'good' | 'warn' | 'bad' | string; }
export interface QuestionInfo { key: string; text: string; options: { value: string; label: string }[]; }

/** GET /api/analyses/config — แบบสอบถามมาจาก config ฝั่ง backend (แก้คำถามไม่ต้องแก้หน้าเว็บ) */
export interface AnalysisConfig {
  foodGroups: GroupInfo[];
  questions: QuestionInfo[];
  /** yyyy-mm-dd เวลาไทย */
  today: string;
  reviewDays: number;
  dailyLimit: number;
  /** มื้อทั้งหมดตามลำดับ (เช้า กลางวัน เย็น ดึก) — ตัวเลือก dropdown */
  mealSlots: { key: string; label: string }[];
  /** เพิ่มเมนูเองได้ไม่เกินกี่รายการต่อวัน */
  manualMealsPerDay: number;
}

/** LIKE = จากการกดถูกใจ, MANUAL = ผู้ใช้เพิ่มเอง */
export type MealSource = 'LIKE' | 'MANUAL';

export interface ReviewItem {
  /** id ที่ใช้แก้รายการ (PATCH/DELETE /api/analyses/review/meals/{id}) */
  id: string;
  source: MealSource;
  recipeId: string;
  name: string;
  menuName: string;
  imageUrl: string | null;
  likedAt: string;
  mealSlot: string;
  mealLabel: string;
  foodGroups: FoodGroupKey[];
}

export interface ReviewView {
  date: string;
  today: boolean;
  count: number;
  items: ReviewItem[];
  overview: { groups: GroupMark[]; missing: FoodGroupKey[]; complete: boolean; message: string | null };
  /** มื้อตามเวลาตอนนี้ (ค่าเริ่มต้นตอนเพิ่มเมนู) */
  currentSlot: string;
  manualCount: number;
  manualLimit: number;
}

/** GET /api/recipes/search — ไม่มีเมนูในรายการซ่อน / เมนูที่มีอาหารที่แพ้ */
export interface MenuSearchItem {
  id: string;
  name: string;
  menuName: string;
  imageUrl: string | null;
  foodGroups: FoodGroupKey[];
}

export interface LatestSummary {
  latest: { id: string; date: string; totalScore: number; maxScore: number; level: LevelInfo | null } | null;
  /** เทียบครั้งก่อน — ครั้งแรก = null */
  delta: number | null;
  todayCount: number;
}

export interface CreateAnalysis {
  date: string;
  weightKg: number;
  heightCm: number;
  age: number;
  gender: AnalysisGender;
  answers: Record<string, string>;
}

export type AnalysisState = 'PENDING' | 'FOOD_GROUPS' | 'RISK' | 'SUMMARY' | 'DONE' | 'FAILED';
export interface AnalysisStatus { id: string; status: AnalysisState; step: number; failureReason: string | null; }

export interface ScoreInfo { key: string; label: string; icon: string; score: number; max: number; }

export interface AnalysisResult {
  id: string;
  date: string;
  status: AnalysisState;
  person: { weightKg: number; heightCm: number; age: number; gender: string; genderLabel: string;
            bmi: number | null; bmiCategory: string | null };
  foodGroups: GroupMark[];
  missing: FoodGroupKey[];
  complete: boolean;
  scores: { categories: ScoreInfo[]; total: number; maxTotal: number; level: LevelInfo | null } | null;
  advice: string | null;
  adviceSource: 'llm' | 'template' | null;
  meals: { recipeId: string | null; name: string; mealLabel: string; foodGroups: FoodGroupKey[] }[];
  recommendations: { id: string; name: string; menuName: string; imageUrl: string | null; calories: string | null }[];
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class AnalysisService {

  constructor(private http: HttpClient) {}

  config() {
    return this.http.get<AnalysisConfig>('/api/analyses/config');
  }

  review(date?: string) {
    return this.http.get<ReviewView>('/api/analyses/review', { params: date ? { date } : {} });
  }

  /** แก้รายการมื้อ — ทุกตัวคืนรายการของวันนั้นหลังแก้ */
  addMeal(date: string, recipeId: string, mealSlot: string) {
    return this.http.post<ReviewView>('/api/analyses/review/meals', { date, recipeId, mealSlot });
  }

  updateMeal(id: string, change: { mealSlot?: string; excluded?: boolean }) {
    return this.http.patch<ReviewView>(`/api/analyses/review/meals/${encodeURIComponent(id)}`, change);
  }

  /** "ไม่ได้กิน" — ไม่ยกเลิกการถูกใจ; เลิกทำ = updateMeal(id, { excluded: false }) */
  removeMeal(id: string) {
    return this.http.delete<ReviewView>(`/api/analyses/review/meals/${encodeURIComponent(id)}`);
  }

  searchMenus(q: string) {
    return this.http.get<MenuSearchItem[]>('/api/recipes/search', { params: { q } });
  }

  latestSummary() {
    return this.http.get<LatestSummary>('/api/analyses/latest-summary');
  }

  create(body: CreateAnalysis) {
    return this.http.post<{ id: string }>('/api/analyses', body);
  }

  status(id: string) {
    return this.http.get<AnalysisStatus>(`/api/analyses/${encodeURIComponent(id)}/status`);
  }

  retry(id: string) {
    return this.http.post<AnalysisStatus>(`/api/analyses/${encodeURIComponent(id)}/retry`, null);
  }

  result(id: string) {
    return this.http.get<AnalysisResult>(`/api/analyses/${encodeURIComponent(id)}`);
  }
}

/** สีป้ายหมู่อาหาร (คงที่ต่อหมู่ — ใช้ทุกหน้า) */
export const GROUP_CLASS: Record<string, string> = {
  protein: 'g-protein', carb: 'g-carb', mineral: 'g-mineral', vitamin: 'g-vitamin', fat: 'g-fat'
};

/** รูปไอคอนคะแนน 4 ด้าน (key = AnalysisProperties ใน backend) — ที่เดียวที่กำหนด path; โหลดไม่ได้ → ใช้ emoji จาก ScoreInfo.icon */
export const SCORE_ICON_SRC: Record<string, string> = {
  beneficial: 'images/analysis/score/beneficial.webp',
  limit: 'images/analysis/score/limit.webp',
  'sweet-fat-salt': 'images/analysis/score/sweet-fat-salt.webp',
  pattern: 'images/analysis/score/pattern.webp'
};

/** วันที่ yyyy-mm-dd ± n วัน (คิดแบบปฏิทิน ไม่แปลง timezone) */
export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}
