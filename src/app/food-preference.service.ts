import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, concatMap, map, of } from 'rxjs';
import { AuthService } from './auth.service';
import { AllergyValue, NO_ALLERGIES } from './allergy.service';

/** key ที่ backend รู้จัก (FoodPreference.java) */
export type FoodPreferenceKey =
  'spicy' | 'sour' | 'sweet' | 'salty' | 'clean' | 'stir_fry' | 'fried' | 'soup_curry' | 'noodle';

export interface FoodPreferenceOption {
  key: FoodPreferenceKey;
  label: string;
  /** รูปไอคอนจริง — ถ้าโหลดไม่ได้ใช้ emoji แทน (ดู fallback) */
  image: string;
  fallback: string;
}

/**
 * ตัวเลือกใน pop-up — รูปรสชาติ public/images/preferences/{key}.webp (128×128, ต้นฉบับใน frontend/images_originals/preferences/);
 * โหลดไม่ได้ → แสดง emoji. ประเภทอาหารใช้รูปเดิมใน public/images/food-types/.
 */
export const FOOD_PREFERENCE_OPTIONS: FoodPreferenceOption[] = [
  { key: 'spicy', label: 'รสเผ็ด', image: 'images/preferences/spicy.webp', fallback: '🌶️' },
  { key: 'sour', label: 'รสเปรี้ยว', image: 'images/preferences/sour.webp', fallback: '🍋' },
  { key: 'sweet', label: 'รสหวาน', image: 'images/preferences/sweet.webp', fallback: '🍯' },
  { key: 'salty', label: 'รสเค็ม', image: 'images/preferences/salty.webp', fallback: '🧂' },
  { key: 'clean', label: 'อาหารคลีน', image: 'images/food-types/clean.jpg', fallback: '🥗' },
  { key: 'stir_fry', label: 'อาหารผัด', image: 'images/food-types/stirfry.jpg', fallback: '🍳' },
  { key: 'fried', label: 'อาหารทอด', image: 'images/food-types/fried.jpg', fallback: '🍗' },
  { key: 'soup_curry', label: 'อาหารต้ม/แกง', image: 'images/food-types/soup.jpg', fallback: '🍲' },
  { key: 'noodle', label: 'ก๋วยเตี๋ยว', image: 'images/food-types/noodle.jpg', fallback: '🍜' },
];

/**
 * ความชอบด้านอาหารสำหรับโหมดสุ่ม
 * - login: เก็บที่ backend (users.food_preferences) ผ่าน GET/PUT /api/users/me/food-preferences
 * - guest: เก็บแค่ในตัวแปรของ service นี้ (หน่วยความจำ) — ไม่ลง localStorage/sessionStorage/cookie;
 *   รีเฟรช / เข้า URL ตรง → หาย → ต้องเลือกใหม่
 * อาหารที่แพ้ (ขั้นที่ 2 ของ pop-up) ใช้กฎเดียวกัน: login → users.allergies (PATCH /api/users/me — ที่เดียวกับหน้าโปรไฟล์),
 * guest → หน่วยความจำของ service นี้ แล้วส่งไปกับคำขอสุ่มเมนู / แชต AI (backend กรองโดยไม่บันทึก)
 */
@Injectable({ providedIn: 'root' })
export class FoodPreferenceService {

  private guestPreferences: FoodPreferenceKey[] | null = null;
  private guestAllergies: AllergyValue | null = null;

  constructor(private http: HttpClient, private auth: AuthService) {}

  /**
   * ตัวเลือกที่ไม่แสดงใน pop-up (backend app.non-meal.hidden-preferences เช่น sweet — ไม่มีเมนูให้แนะนำ).
   * ถามใหม่ทุกครั้งที่เปิด pop-up — แอดมินเปลี่ยนสวิตช์/ประเภทในหน้าตั้งค่าแล้วมีผลทันทีโดยไม่ต้องรีเฟรชหน้า.
   * เรียกไม่ได้ → [] (แสดงครบ). ค่าที่ผู้ใช้เคยบันทึกไว้ backend เก็บต่อเอง
   */
  hiddenKeys(): Observable<FoodPreferenceKey[]> {
    return this.http.get<{ hidden: FoodPreferenceKey[] }>('/api/food-preferences/options').pipe(
      map(r => r.hidden ?? []),
      catchError(() => of([] as FoodPreferenceKey[]))
    );
  }

  /** login: ค่าจาก DB (null = ยังไม่เคยตั้ง) */
  loadForUser(): Observable<FoodPreferenceKey[] | null> {
    return this.http.get<{ preferences: FoodPreferenceKey[] | null }>('/api/users/me/food-preferences')
      .pipe(map(r => r.preferences && r.preferences.length ? r.preferences : null));
  }

  saveForUser(keys: FoodPreferenceKey[]): Observable<FoodPreferenceKey[]> {
    return this.http.put<{ preferences: FoodPreferenceKey[] }>('/api/users/me/food-preferences', { preferences: keys })
      .pipe(map(r => r.preferences));
  }

  /** login: อาหารที่แพ้ในโปรไฟล์ (ไว้ติ๊กให้ก่อนในขั้นที่ 2) */
  loadAllergiesForUser(): Observable<AllergyValue> {
    return this.http.get<{ allergies?: AllergyValue | null }>('/api/users/me')
      .pipe(map(r => r.allergies ?? NO_ALLERGIES));
  }

  /** login: บันทึกอาหารที่แพ้ (PATCH /api/users/me แบบ partial — ส่งแค่ allergies, ตรวจค่า 400 ก่อน) แล้วจึงบันทึกความชอบ (PUT เดิม) */
  saveForUserWithAllergies(keys: FoodPreferenceKey[], allergies: AllergyValue): Observable<FoodPreferenceKey[]> {
    return this.http.patch('/api/users/me', { allergies }).pipe(concatMap(() => this.saveForUser(keys)));
  }

  getGuestAllergies(): AllergyValue | null {
    return this.guestAllergies;
  }

  setGuestAllergies(value: AllergyValue): void {
    this.guestAllergies = { keys: [...value.keys], custom: [...value.custom] };
  }

  /** body สำหรับคำขอของ guest ({} เมื่อ login หรือไม่มีอาหารที่แพ้) */
  guestAllergyBody(): { allergies?: AllergyValue } {
    const a = this.guestAllergies;
    return !this.auth.isLoggedIn() && a && (a.keys.length || a.custom.length) ? { allergies: a } : {};
  }

  getGuest(): FoodPreferenceKey[] | null {
    return this.guestPreferences;
  }

  setGuest(keys: FoodPreferenceKey[]): void {
    this.guestPreferences = [...keys];
  }

  clearGuest(): void {
    this.guestPreferences = null;
    this.guestAllergies = null;
  }

  isLoggedIn(): boolean {
    return this.auth.isLoggedIn();
  }
}
