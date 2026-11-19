import { EnvironmentProviders, Provider, inject, provideAppInitializer } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { demoLogin } from './demo-api';
import { demoInterceptor } from './demo.interceptor';
import { showDemoBanner } from './demo-banner';

/** โหมดเดโม (แทน demo-mode.ts ตอน build --configuration demo): API จำลอง + แถบ "โหมดเดโม" ทุกหน้า */
export const DEMO_INTERCEPTORS: HttpInterceptorFn[] = [demoInterceptor];

export const DEMO_PROVIDERS: (Provider | EnvironmentProviders)[] = [
  provideAppInitializer(() => {
    const auth = inject(AuthService);
    const router = inject(Router);
    showDemoBanner(role => {
      auth.saveSession(demoLogin(role === 'admin' ? 'demo_admin' : 'demo_user'), false);
      void router.navigateByUrl(role === 'admin' ? '/admin' : '/home');
    });
  })
];
