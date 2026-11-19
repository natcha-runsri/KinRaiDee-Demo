/**
 * กฎ validate กลางของทุกฟอร์ม auth (Login / Register / Forgot / Reset).
 * สำเนาของ backend `CredentialRules.java` — ข้อความต้องตรงกัน. frontend ตรวจเพื่อความเร็ว
 * backend เป็นตัวตัดสินสุดท้ายเสมอ.
 *
 * ทุกฟังก์ชันคืน "ข้อความ error ภาษาไทย" หรือ null ถ้าผ่าน.
 */

export const USERNAME_RULE = 'Username ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษและตัวเลข (4-20 ตัว)';
export const PASSWORD_RULE =
  'รหัสผ่านต้องมี 9 ตัว: ตัวพิมพ์เล็ก 1, ตัวพิมพ์ใหญ่ 1, อักขระพิเศษ 1 และตัวเลข 6 ตัว';
export const PASSWORD_SPECIALS = '!@#$%^&*()_+-=[]{}|;:,.<>?~';

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** ว่าง = ไม่มีค่า หรือมีแต่ช่องว่าง */
export function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim() === '';
}

const isAsciiLetter = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isDigit = (c: string) => c >= '0' && c <= '9';

/** username (trim แล้ว): a-z A-Z 0-9 เท่านั้น ยาว 4-20 */
export function usernameError(raw: string): string | null {
  if (isBlank(raw)) return 'กรุณากรอก Username';
  const u = raw.trim();
  for (const c of u) {
    if (!isAsciiLetter(c) && !isDigit(c)) return USERNAME_RULE;
  }
  if (u.length < 4 || u.length > 20) return 'Username ต้องยาว 4-20 ตัวอักษร';
  return null;
}

/** อีเมล (trim แล้ว): local@domain.tld, @ ตัวเดียว, ไม่มีช่องว่าง, ยาวไม่เกิน 254 — เหมือน CredentialRules.emailProblem */
export function emailError(raw: string): string | null {
  if (isBlank(raw)) return 'กรุณากรอกอีเมล';
  const e = raw.trim();
  if (e.length > 254) return 'อีเมลยาวเกิน 254 ตัวอักษร';
  const at = e.indexOf('@');
  const ok = at > 0
    && at === e.lastIndexOf('@')
    && !/\s/.test(e)
    && e.indexOf('.', at + 2) > 0
    && !e.endsWith('.');
  return ok ? null : 'รูปแบบอีเมลไม่ถูกต้อง';
}

/** ช่อง login: มี "@" = อีเมล (บัญชีเก่า), ไม่มี = username. ไม่บังคับกฎรหัสผ่าน */
export function loginIdentifierError(raw: string): string | null {
  if (isBlank(raw)) return 'กรุณากรอก Username';
  return raw.includes('@') ? emailError(raw) : usernameError(raw);
}

/** ตอน login: แค่ห้ามว่าง (บัญชีเก่ามีรหัสที่ไม่ตรงกฎ 9 ตัว) */
export function loginPasswordError(pw: string): string | null {
  return isBlank(pw) ? 'กรุณากรอกรหัสผ่าน' : null;
}

/**
 * 9 ตัวพอดี: a-z 1, A-Z 1, อักขระพิเศษ (PASSWORD_SPECIALS) 1, ตัวเลข 6. ไม่ trim.
 * blankMessage ให้แต่ละฟอร์มใช้คำของตัวเอง ("กรุณากรอกรหัสผ่าน" / "กรุณากรอกรหัสผ่านใหม่")
 */
export function passwordError(pw: string, blankMessage = 'กรุณากรอกรหัสผ่าน'): string | null {
  if (isBlank(pw)) return blankMessage;
  let lower = 0, upper = 0, special = 0, digit = 0;
  for (const c of pw) {
    if (c >= 'a' && c <= 'z') lower++;
    else if (c >= 'A' && c <= 'Z') upper++;
    else if (isDigit(c)) digit++;
    else if (PASSWORD_SPECIALS.includes(c)) special++;
    else return 'รหัสผ่านมีอักขระที่ไม่อนุญาต (ห้ามเว้นวรรค ภาษาไทย หรืออักขระนอกชุดที่กำหนด)';
  }
  if (pw.length !== 9) return `รหัสผ่านต้องยาว 9 ตัวพอดี (ตอนนี้ ${pw.length} ตัว)`;
  if (lower !== 1) return countProblem('ตัวพิมพ์เล็ก (a-z)', 1, lower);
  if (upper !== 1) return countProblem('ตัวพิมพ์ใหญ่ (A-Z)', 1, upper);
  if (special !== 1) return countProblem('อักขระพิเศษ', 1, special);
  if (digit !== 6) return countProblem('ตัวเลข', 6, digit);
  return null;
}

function countProblem(kind: string, expected: number, actual: number): string {
  return `${PASSWORD_RULE} — ต้องมี${kind} ${expected} ตัว (ตอนนี้ ${actual} ตัว)`;
}

/** ยืนยันรหัสผ่าน: ต้องตรงทุกตัวอักษร (ไม่ trim) */
export function confirmPasswordError(password: string, confirm: string): string | null {
  if (isBlank(confirm)) return 'กรุณายืนยันรหัสผ่าน';
  return password === confirm ? null : 'รหัสผ่านไม่ตรงกัน';
}

export function otpError(otp: string): string | null {
  if (isBlank(otp)) return 'กรุณากรอกรหัสยืนยัน';
  return /^\d{6}$/.test(otp) ? null : 'รหัสยืนยันต้องเป็นตัวเลข 6 หลัก';
}

/** รวมผลตรวจรายช่อง ตัดช่องที่ผ่าน (null) ทิ้ง */
export function collectErrors<K extends string>(checks: Record<K, string | null>): FieldErrors<K> {
  const out: FieldErrors<K> = {};
  for (const key of Object.keys(checks) as K[]) {
    if (checks[key]) out[key] = checks[key] as string;
  }
  return out;
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}
