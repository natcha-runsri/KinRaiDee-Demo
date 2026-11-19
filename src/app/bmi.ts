/**
 * BMI ฝั่งหน้าเว็บ — ใช้เฉพาะตอนพิมพ์ในโหมดแก้ไขโปรไฟล์ (ค่าที่บันทึกแล้วมาจาก GET /api/users/me ซึ่ง backend คำนวณด้วย
 * AnalysisRules.bmi ตัวเดียวกับผลวิเคราะห์). เกณฑ์ระดับไม่เขียนซ้ำ: รับ bmiScale จาก backend (analysis-rules.yml bmi-categories).
 * สูตรต้องให้ผลตรงกับ backend: กก. / ม.² ปัดทศนิยม 1 ตำแหน่งแบบ HALF_UP แล้วจัดระดับจากค่าที่ปัดแล้ว —
 * คิดเป็นจำนวนเต็มทั้งหมด (น้ำหนัก/ส่วนสูงมีทศนิยมไม่เกิน 1 ตำแหน่ง) จึงไม่มีปัญหาทศนิยมของ float ที่ขอบ .x5
 */

/** ระดับหนึ่งใน bmiScale: ระดับแรกที่ bmi < below (below = null → ระดับสุดท้าย) */
export interface BmiLevel {
  below: number | null;
  label: string;
  /** good = เขียว, warn = เหลือง, bad = แดง */
  tone: string;
}

export interface BmiResult {
  value: number;
  category: string | null;
  tone: string | null;
}

/** ค่าทศนิยม 1 ตำแหน่งเป็นหน่วย 1/10 (ไม่ใช่ตัวเลขบวก หรือทศนิยมเกิน 1 ตำแหน่ง → null) */
function tenths(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!/^\d+(\.\d)?$/.test(s)) return null;
  const n = Math.round(Number(s) * 10);
  return n > 0 ? n : null;
}

/** BMI จากน้ำหนัก (กก.) และส่วนสูง (ซม.) — ไม่ครบ/รูปแบบผิด → null */
export function computeBmi(weightKg: string | number | null | undefined, heightCm: string | number | null | undefined,
                           scale: BmiLevel[] | null | undefined): BmiResult | null {
  const w = tenths(weightKg);
  const h = tenths(heightCm);
  if (w === null || h === null) return null;
  // bmi × 10 = w10 × 10^6 / h10² → ปัด HALF_UP ด้วยจำนวนเต็ม
  const den = h * h;
  const bmi10 = Math.floor((2 * w * 1_000_000 + den) / (2 * den));
  const level = (scale ?? []).find(l => l.below === null || bmi10 < Math.round(l.below * 10));
  return { value: bmi10 / 10, category: level?.label ?? null, tone: level?.tone ?? null };
}
