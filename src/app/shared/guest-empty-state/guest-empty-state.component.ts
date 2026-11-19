import { Component, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

/**
 * หน้าว่างชวนเข้าสู่ระบบ สำหรับผู้ใช้ที่ไม่ได้ login (ใช้ร่วม: /history, /analysis และหน้าย่อยวิเคราะห์).
 * ภาพสมองถือแว่นขยาย + หัวข้อ + คำรอง + ปุ่ม "เข้าสู่ระบบ" (→ /login?returnUrl=...) + ลิงก์สมัครสมาชิก (เลือกได้).
 * breadcrumb ว่าง = หน้าที่ใช้วาดแถบเอง (เช่น /history ที่มีแถบทั้งตอน login และไม่ login).
 */
@Component({
  selector: 'app-guest-empty-state',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './guest-empty-state.component.html',
  styleUrl: './guest-empty-state.component.css',
  host: { '[class.standalone]': '!!breadcrumb()' }
})
export class GuestEmptyStateComponent {

  private router = inject(Router);

  readonly title = input.required<string>();
  readonly subtitle = input('');
  /** path ภายในเว็บที่จะกลับมาหลัง login/สมัครเสร็จ */
  readonly returnUrl = input('/home');
  readonly breadcrumb = input<string | null>(null);
  readonly showRegister = input(false);

  /** ไฟล์ภาพยังไม่มี → กรอบ placeholder บอก path ที่ต้องวางไฟล์ */
  readonly artMissing = signal(false);

  goLogin(): void {
    void this.router.navigate(['/login'], { queryParams: { returnUrl: this.returnUrl() } });
  }
}
