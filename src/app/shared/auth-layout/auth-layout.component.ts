import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthReturnService } from '../../auth-return.service';

/**
 * Layout หน้าเต็มจอของ Login / Register: ซ้ายพื้นครีม + รูปอาหาร "Smart Pick", ขวาพื้นแดงเข้ม + ฟอร์ม (ng-content)
 * กว้างไม่เกิน 440px กึ่งกลางแนวตั้ง. แถบบน (fixed): โลโก้ "KinRai" ซ้าย → home, ปุ่ม X ขวา → หน้าก่อนเข้า auth.
 * จอ 768–1023px ซ่อนฝั่งรูป แถบบนมีพื้นทึบ ฟอร์มเลื่อนลอดใต้แถบ (ปุ่ม X ไม่ทับช่องกรอก).
 * มือถือ ≤ 767px: แถบบนครีม (โลโก้วงกลม + X) → แบนเนอร์รูปอาหารเต็มกว้าง ~1/4 จอ → ฟอร์มพื้นแดง.
 * สไตล์ของฟอร์มด้านใน (ช่อง, ปุ่ม, error) อยู่ที่ shared/auth-form.css (global, prefix .auth-).
 */
@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './auth-layout.component.html',
  styleUrl: './auth-layout.component.css'
})
export class AuthLayoutComponent {

  constructor(
    private router: Router,
    private authReturn: AuthReturnService
  ) {}

  /** ออกจากหน้า auth ทันที (ไม่ถามแม้มีข้อมูลค้าง). replaceUrl: ปุ่ม Back ของเบราว์เซอร์ไม่พากลับมาหน้า auth นี้อีก */
  close(): void {
    void this.router.navigateByUrl(this.authReturn.returnUrl(), { replaceUrl: true });
  }
}
