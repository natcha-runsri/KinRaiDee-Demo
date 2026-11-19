import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { FoodPreferenceKey, FoodPreferenceService } from './food-preference.service';

/** โควตาจาก backend — frontend แสดงผลอย่างเดียว ห้ามคำนวณ/เก็บเอง */
export interface SpinQuota {
  remaining: number;
  limit: number;
  resetsAt: string;
}

/** ป้ายสั้นๆ ของเมนู (icon: heart | protein | clock | plate | leaf) */
export interface RecipeChip {
  label: string;
  icon: string;
}

/** การ์ดเมนูจากการสุ่ม — calories = null เมื่อยังไม่มีข้อมูล (ซ่อนป้าย) */
export interface RecipeCard {
  id: string;
  /** ชื่อสั้น */
  name: string;
  /** ชื่อบทความเต็ม (alt / aria) */
  title: string;
  description: string | null;
  /** รูปของเราบน Cloudinary — ยังไม่มี → null (ภาพสำรอง) */
  imageUrl: string | null;
  calories: string | null;
  highlights: RecipeChip[];
}

export interface SpinResult extends SpinQuota {
  spinId: string;
  recipe: RecipeCard;
  liked: boolean;
}

export interface LatestSpin {
  spinId: string;
  recipe: RecipeCard;
  liked: boolean;
  spunAt: string;
}

export interface BannerItem {
  id: string;
  name: string;
  /** รูปของเรา — ยังไม่มี → null (หน้าสุ่มตัดออกจากสไลด์) */
  imageUrl: string | null;
}

/**
 * API โหมดสุ่มเมนู. เรียกผ่าน proxy ของ dev server (same-origin) → cookie kr_anon (HttpOnly) ถูกส่งไปเอง
 * ไม่ต้อง withCredentials. JWT แนบโดย authInterceptor (ถ้า login).
 */
@Injectable({ providedIn: 'root' })
export class RandomSpinService {

  constructor(private http: HttpClient, private foodPreferences: FoodPreferenceService) {}

  quota() {
    return this.http.get<SpinQuota>('/api/recommend/random/quota');
  }

  /**
   * guest ต้องส่ง preferences + อาหารที่แพ้จากหน่วยความจำ (ไม่เก็บที่ไหน); login ส่ง null — backend ใช้ความชอบและอาหารที่แพ้จาก DB
   */
  spin(preferences: FoodPreferenceKey[] | null) {
    return this.http.post<SpinResult>('/api/recommend/random/spin',
      preferences ? { preferences, ...this.foodPreferences.guestAllergyBody() } : {});
  }

  /** ผลการสุ่มล่าสุดของวันนี้ — ไม่มี (204) → null */
  latest(): Observable<LatestSpin | null> {
    return this.http.get<LatestSpin>('/api/recommend/random/latest', { observe: 'response' })
      .pipe(map((r: HttpResponse<LatestSpin>) => (r.status === 204 ? null : r.body)));
  }

  /** POST — อาหารที่แพ้ของ guest ไปใน body (ไม่ใส่ใน URL); login ส่ง null → backend ใช้ค่าใน DB */
  banner(preferences: FoodPreferenceKey[] | null) {
    return this.http.post<BannerItem[]>('/api/recommend/random/banner',
      preferences ? { preferences, ...this.foodPreferences.guestAllergyBody() } : {});
  }

  /** ถูกใจเมนู (login เท่านั้น) — spinId = ผลการสุ่มที่ถูกใจ (null ได้) */
  like(recipeId: string, spinId: string | null) {
    return this.http.post<void>(`/api/recipes/${encodeURIComponent(recipeId)}/like`,
      { spinId, source: 'RANDOM' });
  }
}
