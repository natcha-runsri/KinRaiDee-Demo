import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../auth.service';
import { safeReturnUrl } from '../../../auth-return.service';
import { FieldErrors, collectErrors, hasErrors, loginIdentifierError, loginPasswordError } from '../../../auth.validators';
import { AuthLayoutComponent } from '../../../shared/auth-layout/auth-layout.component';
import { ForgotPasswordDialogComponent } from './forgot-password-dialog/forgot-password-dialog.component';

type Field = 'username' | 'password';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, AuthLayoutComponent, ForgotPasswordDialogComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {

  username = '';
  password = '';
  showPassword = false;
  remember = false;

  errors: FieldErrors<Field> = {};
  errorMessage = '';
  /** ข้อความสำเร็จบนหน้า Login เช่น หลังรีเซ็ตรหัสผ่านใน pop-up */
  flashMessage = '';
  isSubmitting = false;
  /** pop-up ลืมรหัสผ่าน — สร้างใหม่ทุกครั้งที่เปิด (@if) จึงเริ่มขั้นที่ 1 เสมอ */
  forgotOpen = false;

  /** validate หลังกดปุ่มครั้งแรกเท่านั้น (ไม่ validate ตอน blur → ลิงก์คลิกเดียวออกได้) */
  private submitted = false;

  @ViewChild('forgotLink') forgotLink?: ElementRef<HTMLButtonElement>;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // /forgot-password (URL เก่า) redirect มาที่ /login?forgot=1 → เปิด pop-up แล้วลบ query ออกจาก URL
    if (this.route.snapshot.queryParamMap.get('forgot') === '1') {
      this.forgotOpen = true;
      void this.router.navigate([], {
        relativeTo: this.route, queryParams: { forgot: null }, queryParamsHandling: 'merge', replaceUrl: true
      });
    }
  }

  onInput(): void {
    if (this.submitted) {
      this.errors = this.validate();
    }
    this.errorMessage = '';
  }

  submit(): void {
    if (this.isSubmitting) return;
    this.submitted = true;
    this.errorMessage = '';
    this.flashMessage = '';
    this.errors = this.validate();
    if (hasErrors(this.errors)) return; // ช่องว่าง/รูปแบบผิด → ไม่ส่ง request

    this.isSubmitting = true;
    this.authService.login(this.username, this.password, this.remember).subscribe({
      next: (res) => {
        this.authService.saveSession(res, this.remember); // จะ sync preference ที่ค้างไว้ให้อัตโนมัติ
        this.isSubmitting = false;
        void this.router.navigateByUrl(this.safeReturnUrl());
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting = false;
        const e = this.authService.toFormError(err);
        this.errors = e.fields as FieldErrors<Field>;
        // 401 = ข้อความรวม "username หรือรหัสผ่านไม่ถูกต้อง" (ไม่บอกว่าช่องไหนผิด)
        this.errorMessage = e.message;
      }
    });
  }

  /** ?returnUrl=/recommend/random (เช่น guest ใช้สิทธิ์สุ่มครบแล้วกดเข้าสู่ระบบ) — รับเฉพาะ path ภายในเว็บนี้ */
  private safeReturnUrl(): string {
    return safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
  }

  /** สลับไปหน้าสมัคร — พา returnUrl ไปด้วย (สมัครเสร็จกลับหน้าเดิม) */
  goToRegister(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    void this.router.navigate(['/register'], returnUrl ? { queryParams: { returnUrl } } : {});
  }

  openForgot(): void {
    this.forgotOpen = true;
  }

  onForgotClosed(result: { success: boolean }): void {
    this.forgotOpen = false;
    if (result.success) {
      this.flashMessage = 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสใหม่';
      this.errorMessage = '';
    }
    // คืน focus ไปที่ลิงก์ "ลืมรหัสผ่าน?"
    setTimeout(() => this.forgotLink?.nativeElement.focus());
  }

  private validate(): FieldErrors<Field> {
    return collectErrors<Field>({
      username: loginIdentifierError(this.username),
      password: loginPasswordError(this.password)
    });
  }
}
