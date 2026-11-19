import { Injectable } from '@angular/core';
import { FoodPreferenceService } from './food-preference.service';
import { HttpClient } from '@angular/common/http';

/** เมนูในคำตอบ — แสดงเป็น text ธรรมดาเท่านั้น */
export interface AiRecipe {
  id: string;
  displayName: string;
  menuName: string;
  imageUrl: string | null;
  /** ยังไม่มีข้อมูล → null (ซ่อน) */
  calories: string | null;
  tags: string[];
  liked: boolean;
}

/** คำขอหลายมื้อ: เมนูของแต่ละมื้อ (notFound = ไม่พบเมนูตามเงื่อนไข) */
export interface AiMealGroup {
  meal: string;
  label: string;
  recipes: AiRecipe[];
  notFound: boolean;
}

export interface AiChatResponse {
  reply: string;
  notices: string[];
  recipes: AiRecipe[];
  requestedCount: number;
  unsupported: string[];
  conditionsToken: string;
  source: 'llm' | 'fallback';
  offTopic: boolean;
  remaining: number;
  limit: number;
  /** ว่าง = มื้อเดียว/ไม่ระบุมื้อ (แสดงแบบเดิม) */
  groups?: AiMealGroup[];
}

export interface AiChatConfig { chips: string[]; maxLength: number; maxCount: number; remaining: number; limit: number; }

export interface AiChatTurn { role: 'user' | 'assistant'; text: string; }

/** /api/recommend/ai/* — login หรือ guest (cookie kr_anon) */
@Injectable({ providedIn: 'root' })
export class AiRecommendService {

  /** guest: อาหารที่แพ้จาก pop-up ความชอบ (หน่วยความจำ) ไปกับทุกคำขอแชต — login ไม่ส่ง (backend ใช้ค่าใน DB) */
  constructor(private http: HttpClient, private foodPreferences: FoodPreferenceService) {}

  config() {
    return this.http.get<AiChatConfig>('/api/recommend/ai/config', { withCredentials: true });
  }

  ask(message: string, history: AiChatTurn[]) {
    return this.http.post<AiChatResponse>('/api/recommend/ai/chat', { message, history, mode: 'new', ...this.foodPreferences.guestAllergyBody() }, { withCredentials: true });
  }

  /** "ขอเมนูอื่น" — เงื่อนไขเดิมจาก token ที่ server sign (ไม่นับโควตา) */
  more(conditionsToken: string, history: AiChatTurn[]) {
    return this.http.post<AiChatResponse>('/api/recommend/ai/chat', { mode: 'more', conditionsToken, history, ...this.foodPreferences.guestAllergyBody() }, { withCredentials: true });
  }

  /** "ขอเมนูอื่น" ของมื้อเดียวในคำตอบหลายมื้อ — excludeIds = เมนูที่กำลังแสดงในคำตอบนั้น (ไม่เลือกซ้ำ), ไม่นับโควตา */
  moreMeal(conditionsToken: string, meal: string, excludeIds: string[], history: AiChatTurn[]) {
    return this.http.post<AiChatResponse>('/api/recommend/ai/chat',
      { mode: 'more', conditionsToken, meal, excludeIds, history, ...this.foodPreferences.guestAllergyBody() }, { withCredentials: true });
  }

  like(recipeId: string) {
    return this.http.post<void>(`/api/recipes/${encodeURIComponent(recipeId)}/like`, { source: 'AI' });
  }
}
