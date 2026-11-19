import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AllergyValue } from './allergy.service';
import { BmiLevel, BmiResult } from './bmi';

export type Gender = 'male' | 'female' | 'other';

/** GET/PATCH /api/users/me — ค่าที่ยังไม่มี = null */
export interface Account {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  age: number | null;
  gender: Gender | null;
  weightKg: number | null;
  heightCm: number | null;
  avatarUrl: string | null;
  /** อาหารที่แพ้ — ไม่มี = keys/custom ว่าง (backend เก่าอาจไม่ส่ง) */
  allergies?: AllergyValue;
  /** BMI จากน้ำหนัก/ส่วนสูง (สูตร/เกณฑ์เดียวกับผลวิเคราะห์) — ไม่มีค่าใดค่าหนึ่ง = null */
  bmi?: BmiResult | null;
  /** เกณฑ์ BMI ทั้งหมด (คำนวณขณะพิมพ์ในโหมดแก้ไขด้วย computeBmi) */
  bmiScale?: BmiLevel[];
}

/** ส่ง OTP สำเร็จ — cooldownSeconds = รอกี่วินาทีจึงขอใหม่ได้, expiresInSeconds = อายุรหัส */
export interface OtpSentResponse {
  message: string;
  cooldownSeconds: number;
  expiresInSeconds: number;
}

/** ข้อมูลส่วนตัวที่แก้ได้ (ไม่รวมอีเมล) — หน้าโปรไฟล์ส่งครบทุกช่อง (backend รับแบบ partial: ไม่ส่ง = ไม่เปลี่ยน, null = ล้างค่า) */
export interface ProfileFields {
  username: string;
  age: number | null;
  gender: Gender | null;
  weightKg: number | null;
  heightCm: number | null;
  /** ไม่ส่ง = ไม่เปลี่ยน; {keys: [], custom: []} = ล้าง */
  allergies?: AllergyValue;
}

/** API หน้า "บัญชีของฉัน" (/api/users/me) — ต้อง login (interceptor แนบ JWT ให้) */
@Injectable({ providedIn: 'root' })
export class AccountService {

  constructor(private http: HttpClient) {}

  get() {
    return this.http.get<Account>('/api/users/me');
  }

  updateProfile(fields: ProfileFields) {
    return this.http.patch<Account>('/api/users/me', fields);
  }

  // ---- เปลี่ยน / เพิ่มอีเมล: รหัสผ่านปัจจุบัน → ticket → OTP ที่อีเมลใหม่ → confirm ----

  emailVerifyPassword(currentPassword: string) {
    return this.http.post<{ ticket: string; expiresInSeconds: number }>('/api/users/me/email/verify-password',
      { currentPassword });
  }

  emailSendOtp(ticket: string, newEmail: string) {
    return this.http.post<OtpSentResponse>('/api/users/me/email/otp', { ticket, newEmail: newEmail.trim() });
  }

  emailConfirm(ticket: string, otp: string) {
    return this.http.post<Account>('/api/users/me/email/confirm', { ticket, otp });
  }

  // ---- เปลี่ยนรหัสผ่านด้วย OTP ทางอีเมล (ส่งไปที่อีเมลของบัญชีเท่านั้น) ----

  requestPasswordOtp() {
    return this.http.post<OtpSentResponse>('/api/users/me/password/otp', null);
  }

  verifyPasswordOtp(otp: string) {
    return this.http.post<{ resetToken: string; expiresInSeconds: number }>('/api/users/me/password/verify-otp', { otp });
  }

  /** refreshToken = session ปัจจุบัน (ไม่ถูก revoke) */
  resetPassword(resetToken: string, newPassword: string, confirmPassword: string, refreshToken: string | null) {
    return this.http.post<{ message: string }>('/api/users/me/password/reset',
      { resetToken, newPassword, confirmPassword, refreshToken });
  }

  uploadAvatar(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<Account>('/api/users/me/avatar', form);
  }

  deleteAvatar() {
    return this.http.delete<Account>('/api/users/me/avatar');
  }
}
