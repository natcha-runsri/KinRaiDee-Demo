import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, finalize, shareReplay, tap } from 'rxjs';

const TOKEN_KEY = 'kinrai_jwt_token';
const REFRESH_KEY = 'kinrai_refresh_token';
const USER_KEY = 'kinrai_user';

/** ข้อมูล user ที่ backend ส่งกลับ (ไม่มี password hash) */
export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  /** รูปโปรไฟล์ (Cloudinary) — null = ใช้ตัวอักษรแรกของ username */
  avatarUrl?: string | null;
  /** แสดงลิงก์ "จัดการระบบ" เท่านั้น (สิทธิ์จริงตรวจที่ backend ทุกคำขอ); session เก่าไม่มีค่า → syncRole() */
  role?: UserRole;
}

/** REVIEWER = ผู้ประเมินระบบ: เห็นหน้าแอดมินทุกหน้า แต่แก้อะไรไม่ได้ (backend ตอบ 403 ทุกคำขอแก้ไข) */
export type UserRole = 'USER' | 'ADMIN' | 'REVIEWER';

/** response ของ POST /api/auth/register | /login | /refresh (รูปแบบเดียวกัน) */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUser;
}

export interface ForgotPasswordResponse {
  message: string;
  cooldownSeconds: number;
  expiresInSeconds: number;
}

export interface VerifyOtpResponse {
  resetToken: string;
  expiresInSeconds: number;
}

/** body ของ error จาก backend — fieldErrors = ข้อความภาษาไทยแยกรายช่อง */
export interface ApiError {
  error: string;
  message: string;
  fieldErrors?: Record<string, string>;
  retryAfterSeconds?: number;
}

/** error ที่ฟอร์มนำไปแสดง: รายช่อง หรือข้อความรวม */
export interface FormError {
  code: string | null;
  fields: Record<string, string>;
  message: string;
  retryAfterSeconds: number | null;
}

/**
 * Session: "จำฉัน" → localStorage (อยู่ข้ามการปิดเบราว์เซอร์ + refresh token 30 วันฝั่ง backend),
 * ไม่ติ๊ก → sessionStorage (หายเมื่อปิดแท็บ). ไม่เก็บรหัสผ่านฝั่งเบราว์เซอร์ในทุกกรณี.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {

  private refreshInFlight$: Observable<TokenResponse> | null = null;

  /** ผู้ใช้ที่ login อยู่ (navbar / หน้าโปรไฟล์อ่านจากที่นี่ → แก้ชื่อ/รูปแล้วอัปเดตทุกที่ทันที) */
  readonly currentUser = signal<AuthUser | null>(null);

  constructor(private http: HttpClient) {
    this.currentUser.set(this.getUser());
  }

  // ---------- session state ----------

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  getToken(): string | null {
    return this.read(TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return this.read(REFRESH_KEY);
  }

  getUser(): AuthUser | null {
    const raw = this.read(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  /** เรียกหลัง login()/register() สำเร็จ */
  saveSession(res: TokenResponse, remember: boolean): void {
    this.clearSession();
    this.write(remember ? localStorage : sessionStorage, res);
  }

  /** ล้างทั้ง localStorage และ sessionStorage */
  clearSession(): void {
    for (const store of [localStorage, sessionStorage]) {
      store.removeItem(TOKEN_KEY);
      store.removeItem(REFRESH_KEY);
      store.removeItem(USER_KEY);
    }
    this.currentUser.set(null);
  }

  /** หลังแก้โปรไฟล์/รูป: อัปเดตข้อมูลผู้ใช้ที่เก็บไว้ (ที่เดียวกับ token) + แจ้ง navbar */
  updateUser(patch: Partial<AuthUser>): void {
    const current = this.getUser();
    if (!current) return;
    const next = { ...current, ...patch };
    const store = localStorage.getItem(USER_KEY) ? localStorage : sessionStorage;
    store.setItem(USER_KEY, JSON.stringify(next));
    this.currentUser.set(next);
  }

  /** แอดมินและผู้ประเมิน (REVIEWER) เปิดหน้าแอดมินได้ */
  canOpenAdmin(): boolean {
    const role = this.currentUser()?.role;
    return role === 'ADMIN' || role === 'REVIEWER';
  }

  /** session ที่บันทึกก่อนมี role: อ่าน role จาก /api/users/me ครั้งเดียว (navbar เรียกตอนเปิดแอป) */
  syncRole(): void {
    const user = this.currentUser();
    if (!user || user.role) return;
    this.http.get<{ role?: UserRole }>('/api/users/me').subscribe({
      next: me => { if (me.role) this.updateUser({ role: me.role }); },
      error: () => {}
    });
  }

  // ---------- API ----------

  login(username: string, password: string, rememberMe: boolean) {
    return this.http.post<TokenResponse>('/api/auth/login', { username: username.trim(), password, rememberMe });
  }

  register(username: string, email: string, password: string, confirmPassword: string, rememberMe: boolean) {
    return this.http.post<TokenResponse>('/api/auth/register',
      { username: username.trim(), email: email.trim(), password, confirmPassword, rememberMe });
  }

  /** revoke refresh token ฝั่ง backend (ไม่รอผล) แล้วล้าง session ทั้งสองที่ */
  logout(): void {
    const refreshToken = this.getRefreshToken();
    this.clearSession();
    if (refreshToken) {
      this.http.post('/api/auth/logout', { refreshToken }).subscribe({ error: () => {} });
    }
  }

  /**
   * ใช้โดย interceptor เมื่อ access token หมดอายุ (401). request พร้อมกันหลายตัวใช้ refresh รอบเดียวกัน.
   * token ใหม่ถูกเก็บในที่เดิม (local/session) ตาม "จำฉัน" ตอนล็อกอิน.
   */
  refreshSession(): Observable<TokenResponse> {
    if (!this.refreshInFlight$) {
      const store = localStorage.getItem(REFRESH_KEY) ? localStorage : sessionStorage;
      this.refreshInFlight$ = this.http
        .post<TokenResponse>('/api/auth/refresh', { refreshToken: this.getRefreshToken() })
        .pipe(
          tap(res => this.write(store, res)),
          finalize(() => (this.refreshInFlight$ = null)),
          shareReplay(1)
        );
    }
    return this.refreshInFlight$;
  }

  forgotPassword(email: string) {
    return this.http.post<ForgotPasswordResponse>('/api/auth/forgot-password', { email: email.trim() });
  }

  verifyOtp(email: string, otp: string) {
    return this.http.post<VerifyOtpResponse>('/api/auth/verify-otp', { email: email.trim(), otp });
  }

  resetPassword(resetToken: string, newPassword: string, confirmPassword: string) {
    return this.http.post<{ message: string }>('/api/auth/reset-password',
      { resetToken, newPassword, confirmPassword });
  }

  /** แปลง HttpErrorResponse เป็นข้อความไทยสำหรับฟอร์ม */
  toFormError(err: HttpErrorResponse): FormError {
    const body = (err.error ?? null) as ApiError | null;
    const fields = body?.fieldErrors ?? {};
    let message = '';
    if (err.status === 0) {
      message = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง';
    } else if (!Object.keys(fields).length) {
      message = body?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
    }
    return {
      code: body?.error ?? null,
      fields,
      message,
      retryAfterSeconds: body?.retryAfterSeconds ?? null
    };
  }

  // ---------- storage helpers ----------

  private read(key: string): string | null {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  }

  private write(store: Storage, res: TokenResponse): void {
    store.setItem(TOKEN_KEY, res.accessToken);
    store.setItem(REFRESH_KEY, res.refreshToken);
    store.setItem(USER_KEY, JSON.stringify(res.user));
    this.currentUser.set(res.user);
  }
}
