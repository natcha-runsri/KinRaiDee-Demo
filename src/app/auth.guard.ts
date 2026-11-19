import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** หน้าที่ต้อง login: ยังไม่ login → /login?returnUrl=<หน้าเดิม> แล้ว Login พากลับมา */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(AuthService).isLoggedIn()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * หน้าย่อยที่ต้อง login แต่มีหน้าชวนเข้าสู่ระบบของส่วนนั้นอยู่แล้ว (เช่น /analysis/*):
 * ยังไม่ login → guestPath?returnUrl=<หน้าเดิม> — ปุ่ม "เข้าสู่ระบบ" ในหน้านั้นพากลับมาหน้าเดิมหลัง login
 */
export function loginOrGuestPage(guestPath: string): CanActivateFn {
  return (_route, state) => {
    if (inject(AuthService).isLoggedIn()) return true;
    return inject(Router).createUrlTree([guestPath], { queryParams: { returnUrl: state.url } });
  };
}

/** หน้าที่มีการแก้ไขค้างได้ — ถามยืนยันก่อนออก */
export interface LeaveGuarded {
  canLeave(): boolean | Promise<boolean>;
}

export const unsavedChangesGuard: CanDeactivateFn<LeaveGuarded> = component =>
  component?.canLeave ? component.canLeave() : true;
