import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../auth.service';
import { safeReturnUrl } from '../../../auth-return.service';
import {
  FieldErrors, collectErrors, confirmPasswordError, emailError, hasErrors, passwordError, usernameError
} from '../../../auth.validators';
import { AuthLayoutComponent } from '../../../shared/auth-layout/auth-layout.component';

type Field = 'username' | 'email' | 'password' | 'confirmPassword';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, AuthLayoutComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {

  username = '';
  email = '';
  password = '';
  confirmPassword = '';
  showPassword = false;
  showConfirm = false;
  remember = false;

  errors: FieldErrors<Field> = {};
  formError = '';
  successMessage = '';
  isSubmitting = false;

  /**
   * validate เฉพาะหลังกด "ลงทะเบียน" ครั้งแรก (แล้วค่อย live ตอนพิมพ์) — ไม่ validate ตอน blur
   * เพราะ error ที่โผล่ตอน blur จะดัน layout ทำให้ปุ่ม X / ลิงก์ที่กำลังคลิกขยับหนี ต้องคลิกซ้ำ
   */
  private submitted = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  /** ?returnUrl= (เช่น /analysis จากหน้าชวนเข้าสู่ระบบ) — ไม่มี/ไม่ปลอดภัย → null (ไปหน้าหลักตามเดิม) */
  private get returnUrl(): string | null {
    return safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'), '') || null;
  }

  onInput(): void {
    if (this.submitted) {
      this.errors = this.validate();
    }
    this.formError = '';
  }

  submit(): void {
    if (this.isSubmitting) return;
    this.submitted = true;
    this.formError = '';
    this.errors = this.validate();
    if (hasErrors(this.errors)) return; // มีช่องว่าง/ผิดกฎ → ไม่ส่ง request

    this.isSubmitting = true;
    this.authService.register(this.username, this.email, this.password, this.confirmPassword, this.remember).subscribe({
      next: (res) => {
        this.authService.saveSession(res, this.remember); // navbar อ่าน isLoggedIn() → เปลี่ยนเป็นสถานะล็อกอิน
        const back = this.returnUrl;
        this.successMessage = back ? 'ลงทะเบียนสำเร็จ! กำลังพากลับไปหน้าเดิม...' : 'ลงทะเบียนสำเร็จ! กำลังพาไปหน้าหลัก...';
        setTimeout(() => this.router.navigateByUrl(back ?? '/home'), 700);
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting = false;
        const e = this.authService.toFormError(err);
        this.errors = e.fields as FieldErrors<Field>;
        this.formError = e.message;
      }
    });
  }

  goToLogin(): void {
    const back = this.returnUrl;
    void this.router.navigate(['/login'], back ? { queryParams: { returnUrl: back } } : {});
  }

  private validate(): FieldErrors<Field> {
    return collectErrors<Field>({
      username: usernameError(this.username),
      email: emailError(this.email),
      password: passwordError(this.password),
      confirmPassword: confirmPasswordError(this.password, this.confirmPassword)
    });
  }
}
