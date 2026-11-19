import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AdminService } from './admin.service';
import { AuthService } from './auth.service';

/**
 * /admin/**: ยังไม่ login → /login?returnUrl; login แล้วถาม backend (/api/admin/me — role อ่านจาก DB) ไม่เชื่อ role ที่เก็บในเบราว์เซอร์.
 * ไม่ใช่แอดมิน (403) → หน้าหลัก. role ที่ได้อัปเดตกลับเข้า session (ลิงก์ "จัดการระบบ" ใน navbar)
 */
export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  return inject(AdminService).me().pipe(
    map(me => {
      if (auth.currentUser()?.role !== me.role) auth.updateUser({ role: me.role });   // ADMIN หรือ REVIEWER (ดูอย่างเดียว)
      return true;
    }),
    catchError(err => {
      if (err?.status === 403 && auth.canOpenAdmin()) auth.updateUser({ role: 'USER' });
      return of(err?.status === 401
        ? router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })
        : router.createUrlTree(['/home']));
    })
  );
};
