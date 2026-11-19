import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/** หน้า auth — ปุ่ม X ต้องไม่พากลับมาที่หน้าเหล่านี้ */
const AUTH_PATHS = ['/login', '/register', '/signup', '/forgot-password'];

/** ?returnUrl= ที่รับได้: เฉพาะ path ภายในเว็บนี้ (กัน open redirect เช่น //evil.com, /\evil.com) — ไม่ผ่าน → fallback */
export function safeReturnUrl(url: string | null | undefined, fallback = '/home'): string {
  return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\') ? url : fallback;
}

export function isAuthUrl(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return AUTH_PATHS.includes(path);
}

/**
 * จำ URL ล่าสุดที่ไม่ใช่หน้า auth เพื่อให้ปุ่ม X ของ Login/Register พาผู้ใช้กลับไปหน้าก่อนเข้า auth
 * (สลับ Login ↔ Register กี่รอบก็ออกได้คลิกเดียว). ไม่มีหน้าก่อนหน้าในเว็บนี้ (ลิงก์ตรง/แท็บใหม่/reload) → /home.
 * ต้องสร้างตั้งแต่เริ่มแอป (provideAppInitializer ใน app.config.ts) จึงเห็น navigation แรกด้วย.
 */
@Injectable({ providedIn: 'root' })
export class AuthReturnService {

  private lastNonAuthUrl: string | null = null;

  constructor(router: Router) {
    router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        if (!isAuthUrl(e.urlAfterRedirects)) {
          this.lastNonAuthUrl = e.urlAfterRedirects;
        }
      });
  }

  returnUrl(): string {
    return this.lastNonAuthUrl ?? '/home';
  }
}
