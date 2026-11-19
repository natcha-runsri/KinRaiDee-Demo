import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';

/** อาหารที่แพ้ของผู้ใช้ (users.allergies): keys = ตัวเลือกมาตรฐาน, custom = ที่ผู้ใช้พิมพ์เอง */
export interface AllergyValue {
  keys: string[];
  custom: string[];
}

/** GET /api/allergens — ตัวเลือกมาตรฐาน + ข้อจำกัดรายการที่เพิ่มเอง (กฎอยู่ใน backend allergens.yml) */
export interface AllergenOptions {
  items: { key: string; label: string }[];
  customMaxItems: number;
  customMaxLength: number;
}

export const NO_ALLERGIES: AllergyValue = { keys: [], custom: [] };

@Injectable({ providedIn: 'root' })
export class AllergyService {
  private options$?: Observable<AllergenOptions>;

  constructor(private http: HttpClient) {}

  options(): Observable<AllergenOptions> {
    return (this.options$ ??= this.http.get<AllergenOptions>('/api/allergens').pipe(shareReplay(1)));
  }
}

export function sameAllergies(a: AllergyValue | null | undefined, b: AllergyValue | null | undefined): boolean {
  const norm = (v: AllergyValue | null | undefined) =>
    JSON.stringify({ k: [...(v?.keys ?? [])].sort(), c: [...(v?.custom ?? [])] });
  return norm(a) === norm(b);
}
