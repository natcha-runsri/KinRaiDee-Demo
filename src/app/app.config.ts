import { ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './auth.interceptor';
import { AuthReturnService } from './auth-return.service';

export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // เริ่มจำหน้าก่อนเข้า Login/Register ตั้งแต่ navigation แรก (ปุ่ม X ของหน้า auth)
    provideAppInitializer(() => { inject(AuthReturnService); })]
};
