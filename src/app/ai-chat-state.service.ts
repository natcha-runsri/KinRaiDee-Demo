import { Injectable, effect, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { AiMealGroup, AiRecipe } from './ai-recommend.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  loading?: boolean;
  recipes?: AiRecipe[];
  notices?: string[];
  /** conditionsToken — "ขอเมนูอื่น" ใช้เงื่อนไขเดิม (หมดอายุ → ปุ่มกดไม่ได้) */
  token?: string;
  /** backend ตอบว่า token ใช้ไม่ได้แล้ว (หมดอายุ/ไม่ถูกต้อง) */
  tokenExpired?: boolean;
  limitHit?: boolean;
  error?: boolean;
  likeBusy?: Set<string>;
  /** คำขอหลายมื้อ → การ์ดแยกตามมื้อ */
  groups?: AiMealGroup[];
  /** มื้อที่กำลัง "ขอเมนูอื่น" (ทีละมื้อ) */
  groupBusy?: string;
}

const KEY_PREFIX = 'kinrai_ai_chat:';
const MAX_MESSAGES = 50;

interface Stored {
  userId: string;
  messages: ChatMessage[];
  draft: string;
}

/**
 * แชต AI ของหน้า /recommend/ai (ข้อความ, conditionsToken, สถานะถูกใจในการ์ด, ข้อความที่พิมพ์ค้าง, ตำแหน่ง scroll):
 * - อยู่ในหน่วยความจำของ service ระดับ root → ไปหน้ารายละเอียดเมนูแล้วกดย้อนกลับ แชตยังอยู่
 * - ผู้ใช้ที่ login: บันทึกลง sessionStorage ด้วย key ต่อ user id (kinrai_ai_chat:<id>) → รีเฟรชแล้วยังอยู่, ปิดแท็บ = หาย;
 *   เก็บไม่เกิน 50 ข้อความล่าสุด. อ่าน/เขียนไม่ได้ (โหมดส่วนตัว / เต็ม) → ทำงานแบบหน่วยความจำต่อไป
 * - guest: หน่วยความจำเท่านั้น (ไม่เก็บข้อมูล guest ที่ไหน) → รีเฟรช = ว่าง
 * - ผู้ใช้เปลี่ยน (logout, login, สลับบัญชี, guest → login) หรือข้อมูลที่เก็บไม่ตรงกับ user id → ล้างทั้งหน่วยความจำและ sessionStorage ทันที
 */
@Injectable({ providedIn: 'root' })
export class AiChatStateService {

  private auth = inject(AuthService);
  /** เจ้าของแชต: id ผู้ใช้ หรือ null = guest */
  private owner: string | null = this.auth.currentUser()?.id ?? null;

  messages: ChatMessage[] = [];
  draft = '';
  scrollY = 0;

  constructor() {
    this.removeOtherKeys(this.owner);
    this.load();
    effect(() => {
      const id = this.auth.currentUser()?.id ?? null;
      if (id !== this.owner) {
        this.removeKey(this.owner);
        this.owner = id;
        this.removeOtherKeys(id);
        this.reset();
      }
    });
  }

  clear(): void {
    this.removeKey(this.owner);
    this.reset();
  }

  /** บันทึกลง sessionStorage (เฉพาะผู้ใช้ที่ login) — ไม่เก็บสถานะโหลด/ปุ่มกำลังทำงาน */
  save(): void {
    if (!this.owner) return;
    if (this.messages.length > MAX_MESSAGES) this.messages.splice(0, this.messages.length - MAX_MESSAGES);
    const messages = this.messages.filter(m => !m.loading)
      .map(({ likeBusy, groupBusy, loading, ...rest }) => rest);
    const data: Stored = { userId: this.owner, messages, draft: this.draft };
    try {
      sessionStorage.setItem(KEY_PREFIX + this.owner, JSON.stringify(data));
    } catch {
      /* เขียนไม่ได้ → หน่วยความจำอย่างเดียว */
    }
  }

  private load(): void {
    if (!this.owner) return;
    try {
      const raw = sessionStorage.getItem(KEY_PREFIX + this.owner);
      if (!raw) return;
      const data = JSON.parse(raw) as Stored;
      if (data?.userId !== this.owner || !Array.isArray(data.messages)) {
        this.removeKey(this.owner);
        return;
      }
      this.messages = data.messages.slice(-MAX_MESSAGES).map(m => ({ ...m, likeBusy: new Set<string>() }));
      this.draft = typeof data.draft === 'string' ? data.draft : '';
    } catch {
      this.removeKey(this.owner);   // ข้อมูลเสีย → ทิ้ง
    }
  }

  private reset(): void {
    this.messages = [];
    this.draft = '';
    this.scrollY = 0;
  }

  private removeKey(id: string | null): void {
    if (!id) return;
    try {
      sessionStorage.removeItem(KEY_PREFIX + id);
    } catch {
      /* ไม่มี storage */
    }
  }

  /** แชตของบัญชีอื่นที่ค้างในแท็บนี้ (เช่น ปิดเบราว์เซอร์ตอน login อีกบัญชี) → ลบ */
  private removeOtherKeys(keep: string | null): void {
    try {
      const stale: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k?.startsWith(KEY_PREFIX) && k !== KEY_PREFIX + keep) stale.push(k);
      }
      stale.forEach(k => sessionStorage.removeItem(k));
    } catch {
      /* ไม่มี storage */
    }
  }
}

/** conditionsToken = base64url(JSON {c, exp}) + "." + ลายเซ็น — อ่าน exp ได้ (ไม่ต้องรู้กุญแจ); อ่านไม่ได้ = ถือว่ายังใช้ได้ (backend ตัดสิน) */
export function tokenExpired(token: string | undefined, now = Date.now()): boolean {
  if (!token) return true;
  try {
    const body = token.slice(0, token.lastIndexOf('.'));
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' && exp * 1000 <= now;
  } catch {
    return false;
  }
}
