import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * แนบ `Authorization: Bearer <access>` ให้ทุก request /api/** (ยกเว้น /api/auth/** ที่เป็น public).
 * ได้ 401 → refresh token 1 ครั้ง แล้วยิง request เดิมซ้ำ; refresh ไม่ผ่าน → ล้าง session (ต้องล็อกอินใหม่).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/') || req.url.startsWith('/api/auth/')) {
    return next(req);
  }
  const auth = inject(AuthService);
  const withToken = (r: HttpRequest<unknown>, token: string | null) =>
    token ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : r;

  return next(withToken(req, auth.getToken())).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || !auth.getRefreshToken()) {
        return throwError(() => err);
      }
      return auth.refreshSession().pipe(
        catchError(refreshErr => {
          auth.clearSession();
          return throwError(() => refreshErr);
        }),
        switchMap(res => next(withToken(req, res.accessToken)))
      );
    })
  );
};
