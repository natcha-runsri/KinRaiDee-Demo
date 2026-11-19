import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { mergeMap, of, throwError, timer } from 'rxjs';
import { handleDemoRequest } from './demo-api';

/** หน่วงเล็กน้อยให้หน้าเว็บแสดงสถานะกำลังโหลดเหมือนเรียก API จริง */
const LATENCY_MS = 250;

/**
 * โหมดเดโมเท่านั้น (ลงทะเบียนผ่าน demo-mode.demo.ts): ดักทุกคำขอ /api/** แล้วตอบด้วยข้อมูลจำลอง — ไม่มีคำขอออกไปนอกเบราว์เซอร์.
 * อยู่หลัง authInterceptor จึงเห็น header Authorization ที่แนบแล้ว (ใช้แยกผู้ใช้)
 */
export const demoInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const reply = handleDemoRequest(req);
  return timer(LATENCY_MS).pipe(mergeMap(() => {
    if (reply.status >= 400) {
      return throwError(() => new HttpErrorResponse({ status: reply.status, error: reply.body, url: req.url, statusText: 'Demo' }));
    }
    return of(new HttpResponse({ status: reply.status, body: reply.body, url: req.url }));
  }));
};
