/**
 * กฎข้อมูลส่วนตัวหน้า "บัญชีของฉัน" — สำเนาของ backend `ProfileFields.java` (ข้อความต้องตรงกัน).
 * ช่องว่าง = ไม่ระบุ (ผ่าน). คืนข้อความ error ภาษาไทย หรือ null.
 */
import { isBlank } from './auth.validators';

export const AGE_RULE = 'อายุต้องเป็นจำนวนเต็ม 1-120';
export const WEIGHT_RULE = 'น้ำหนักต้องอยู่ระหว่าง 20-300 กก. (ทศนิยมได้ 1 ตำแหน่ง)';
export const HEIGHT_RULE = 'ส่วนสูงต้องอยู่ระหว่าง 50-250 ซม. (ทศนิยมได้ 1 ตำแหน่ง)';

export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPE_ERROR = 'รองรับเฉพาะไฟล์รูป JPEG, PNG หรือ WebP';
export const AVATAR_SIZE_ERROR = 'ไฟล์รูปต้องมีขนาดไม่เกิน 5MB';

export function ageError(raw: string): string | null {
  if (isBlank(raw)) return null;
  const v = raw.trim();
  if (!/^\d{1,3}$/.test(v)) return AGE_RULE;
  const n = Number(v);
  return n >= 1 && n <= 120 ? null : AGE_RULE;
}

function decimalInRange(raw: string, min: number, max: number, rule: string): string | null {
  if (isBlank(raw)) return null;
  const v = raw.trim();
  if (!/^\d{1,3}(\.\d)?$/.test(v)) return rule;
  const n = Number(v);
  return n >= min && n <= max ? null : rule;
}

export const weightError = (raw: string) => decimalInRange(raw, 20, 300, WEIGHT_RULE);
export const heightError = (raw: string) => decimalInRange(raw, 50, 250, HEIGHT_RULE);

/** ค่าในช่อง → ค่าที่ส่ง API (ว่าง = null) */
export function toNumberOrNull(raw: string): number | null {
  return isBlank(raw) ? null : Number(raw.trim());
}

/** ตรวจไฟล์รูปก่อนอัปโหลด (backend ตรวจซ้ำด้วย magic bytes) */
export function avatarFileError(file: File): string | null {
  if (!AVATAR_TYPES.includes(file.type)) return AVATAR_TYPE_ERROR;
  return file.size > AVATAR_MAX_BYTES ? AVATAR_SIZE_ERROR : null;
}
