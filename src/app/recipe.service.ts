import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RecipeChip } from './random-spin.service';

export interface RecipeIngredientView {
  ingredientId: string;
  name: string;
  quantityText: string | null;
  /** รูปจากสินค้าที่จับคู่ได้ — ไม่มี → null */
  imageUrl: string | null;
  /** ลิงก์สินค้า http/https (backend กรองแล้ว) — ไม่มี → null */
  linkUrl: string | null;
  /** สินค้าเปรียบเทียบ ร้านละ ≤1 เรียง BIGC → LOTUS — ไม่มี → [] (backend เก่าอาจไม่ส่ง) */
  products?: IngredientProductView[];
}

export interface IngredientProductView {
  store: 'BIGC' | 'LOTUS';
  name: string;
  /** ขนาดจากท้ายชื่อสินค้า เช่น "500 กรัม" — ไม่มี → null */
  size: string | null;
  /** หน่วยขาย เช่น "กก." — ไม่มี → null */
  unit: string | null;
  price: number | null;
  imageUrl: string;
  url: string;
  /** YYYY-MM-DD — ไม่มี → null */
  collectedAt: string | null;
}

export interface RecipeStepView {
  stepNumber: number;
  /** หัวข้อสั้น — ข้อมูลยังไม่มีแยก → null */
  heading: string | null;
  text: string;
}

export interface RecipeNutrition {
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
}

/** GET /api/recipes/{id} — เฉพาะฟิลด์ที่หน้ารายละเอียดใช้ */
/** เครดิตรูปเมนูของเรา — แสดงใต้รูปหลัก. ai = true: site คือชื่อเครื่องมือ AI (ไม่มีช่างภาพ/ลิงก์/ใบอนุญาต) */
export interface RecipeImageCredit {
  site: string;
  photographer: string | null;
  url: string | null;
  ai?: boolean;
  /** เว็บอื่นนอกจาก Pexels/Unsplash/Pixabay เช่น CC0, CC BY 2.0 — ไม่มี → null */
  license?: string | null;
  /** 'designed-by' = Magnific/Freepik: "designed by {photographer} - {site}" ลิงก์ไปหน้าแรกของเว็บ (ตามใบอนุญาต) */
  style?: string | null;
  /** หน้าใบอนุญาตบน creativecommons.org ของ CC BY / CC BY-SA ตามเวอร์ชัน — CC0 / Public Domain / ไม่มีเวอร์ชัน → null */
  licenseUrl?: string | null;
}

export interface RecipeDetailView {
  id: string;
  menuName: string;
  displayName: string;
  description: string | null;
  /** รูปของเราบน Cloudinary — ยังไม่มี → null (แสดงภาพสำรอง) */
  imageUrl: string | null;
  /** มีเฉพาะเมนูที่มีรูปของเรา */
  imageCredit?: RecipeImageCredit | null;
  /** บทความสูตรต้นทาง (aroifin.com) */
  sourceUrl?: string | null;
  calories: string | null;
  highlights: RecipeChip[];
  nutrition: RecipeNutrition | null;
  /** login + เมนูมีอาหารที่แพ้ → วัตถุดิบ/คำที่ตรง (เรียงตามสูตร); ไม่ login/ไม่ตรง → null */
  allergyMatches?: string[] | null;
  ingredients: RecipeIngredientView[];
  steps: RecipeStepView[];
}

@Injectable({ providedIn: 'root' })
export class RecipeService {

  constructor(private http: HttpClient) {}

  /** หน้ารายละเอียดเมนู: ผู้ใช้ที่ login ถูกใจเมนูนี้อยู่ไหม */
  likeStatus(id: string) {
    return this.http.get<{ liked: boolean }>(`/api/users/me/liked-recipes/${encodeURIComponent(id)}`);
  }

  /** ถูกใจ / ยกเลิกถูกใจจากหน้ารายละเอียด (login เท่านั้น, idempotent) */
  setLiked(id: string, liked: boolean) {
    const url = `/api/recipes/${encodeURIComponent(id)}/like`;
    return liked ? this.http.post<void>(url, { source: 'DETAIL' }) : this.http.delete<void>(url);
  }

  detail(id: string) {
    return this.http.get<RecipeDetailView>(`/api/recipes/${encodeURIComponent(id)}`);
  }
}

/** ลิงก์ภายนอกเปิดได้เฉพาะ http/https (กัน javascript: ที่อาจฝังมากับข้อมูล) — backend กรองแล้ว ตรวจซ้ำอีกชั้น */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
