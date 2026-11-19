import { Injectable, computed, signal } from '@angular/core';

/** ช่วงวันที่ของหน้าแอดมิน (ตัวเลือกบนหัวหน้า) — from/to = YYYY-MM-DD เวลาไทย รวมทั้งสองวัน */
export interface AdminRange {
  preset: 7 | 30 | 90 | 'custom';
  from: string;
  to: string;
}

const KEY = 'kinrai_admin_range';
export const MAX_RANGE_DAYS = 366;

/** วันที่ปัจจุบันเวลาไทย (YYYY-MM-DD) */
export function todayTh(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000) + 1;
}

const TH_DAY_MONTH = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const TH_DATE = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "18 เม.ย. 2025" */
export function thDate(iso: string): string {
  return TH_DATE.format(new Date(iso + 'T00:00:00Z'));
}

/** ช่วงวันที่ใช้ร่วมกันทุกหน้าแอดมิน — จำค่าไว้ใน sessionStorage (อ่าน/เขียนไม่ได้ก็ใช้ค่าเริ่มต้น 7 วัน) */
@Injectable({ providedIn: 'root' })
export class AdminRangeService {

  readonly range = signal<AdminRange>(this.restore());
  readonly label = computed(() => `${thDate(this.range().from)} - ${thDate(this.range().to)}`);
  /** ปีเดียวกัน → ใส่ปีครั้งเดียว (จอแคบ) */
  readonly shortLabel = computed(() => {
    const { from, to } = this.range();
    if (from.slice(0, 4) !== to.slice(0, 4)) return this.label();
    return `${TH_DAY_MONTH.format(new Date(from + 'T00:00:00Z'))} - ${thDate(to)}`;
  });
  readonly days = computed(() => daysBetween(this.range().from, this.range().to));

  setPreset(days: 7 | 30 | 90): void {
    const to = todayTh();
    this.save({ preset: days, from: addDays(to, -(days - 1)), to });
  }

  /** กำหนดเอง: from ≤ to, ไม่เกินวันนี้, ยาวไม่เกิน 366 วัน — ผิดเงื่อนไขคืนข้อความ */
  setCustom(from: string, to: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return 'กรุณาเลือกวันที่ให้ครบ';
    if (from > to) return 'วันเริ่มต้องไม่อยู่หลังวันสิ้นสุด';
    if (to > todayTh()) return 'เลือกวันในอนาคตไม่ได้';
    if (daysBetween(from, to) > MAX_RANGE_DAYS) return `เลือกได้ไม่เกิน ${MAX_RANGE_DAYS} วัน`;
    this.save({ preset: 'custom', from, to });
    return null;
  }

  private save(r: AdminRange): void {
    this.range.set(r);
    try { sessionStorage.setItem(KEY, JSON.stringify(r)); } catch { /* ไม่มี storage ก็ใช้ค่าในหน่วยความจำ */ }
  }

  private restore(): AdminRange {
    const to = todayTh();
    const fallback: AdminRange = { preset: 7, from: addDays(to, -6), to };
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return fallback;
      const r = JSON.parse(raw) as AdminRange;
      // preset เลื่อนตามวันนี้เสมอ; กำหนดเองคงค่าเดิมถ้ายังถูกต้อง
      if (r.preset === 7 || r.preset === 30 || r.preset === 90) {
        return { preset: r.preset, from: addDays(to, -(r.preset - 1)), to };
      }
      if (r.from <= r.to && r.to <= to) return r;
    } catch { /* ค่าเสีย → ค่าเริ่มต้น */ }
    return fallback;
  }
}
