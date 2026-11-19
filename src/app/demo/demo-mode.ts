import { EnvironmentProviders, Provider } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';

/**
 * โหมดปกติ (production / development): ไม่มี interceptor หรือ provider เพิ่ม — ทำงานกับ backend จริงเหมือนเดิม.
 * build แบบ --configuration demo แทนไฟล์นี้ด้วย demo-mode.demo.ts (fileReplacements ใน angular.json)
 * โค้ดข้อมูลจำลองจึงไม่ถูกรวมใน build ปกติเลย
 */
export const DEMO_INTERCEPTORS: HttpInterceptorFn[] = [];
export const DEMO_PROVIDERS: (Provider | EnvironmentProviders)[] = [];
