import {
  AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild
} from '@angular/core';
import { Observable } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService, ForgotPasswordResponse, VerifyOtpResponse } from '../../../../auth.service';
import { AccountService } from '../../../../account.service';
import { OtpInputComponent } from '../../../../shared/otp-input/otp-input.component';
import {
  FieldErrors, collectErrors, confirmPasswordError, emailError, hasErrors, otpError, passwordError
} from '../../../../auth.validators';

type Step = 'email' | 'otp' | 'reset';
type Field = 'email' | 'otp' | 'newPassword' | 'confirmPassword';

const STEPS: Step[] = ['email', 'otp', 'reset'];
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Pop-up ลืมรหัสผ่าน 3 ขั้น: อีเมล → OTP 6 หลัก → ตั้งรหัสใหม่.
 * ปิดด้วย X / Esc / คลิก backdrop (ขั้น 2-3 ถามยืนยันก่อน). ผู้ใช้ component สร้าง/ทำลายด้วย @if → เปิดใหม่เริ่มขั้น 1 เสมอ.
 * focus ถูกกักไว้ใน pop-up และล็อก scroll หน้าหลังระหว่างเปิด.
 *
 * ใช้ 2 แบบ:
 * - หน้า Login (ค่าเริ่มต้น): การ์ดครีมแบบใหม่ (ตัวแปร --dialog-* ใน styles.css), กรอกอีเมลเอง, API สาธารณะ /api/auth/* (สำเร็จแล้วทุก session ต้อง login ใหม่)
 * - หน้าโปรไฟล์ ("ลืมรหัสผ่าน?" ตอนเปลี่ยนอีเมล): {@link theme} = 'light-blue', {@link accountEmail} = อีเมลบัญชี
 *   (แก้ไม่ได้) → ใช้ API /api/users/me/password/* (session ปัจจุบันยังใช้ได้), ขั้นแรกมีลิงก์ {@link backToStart}
 */
@Component({
  selector: 'app-forgot-password-dialog',
  standalone: true,
  imports: [FormsModule, OtpInputComponent],
  templateUrl: './forgot-password-dialog.component.html',
  // light-base + light = หน้าตาเดิมของธีม light-blue (หน้าโปรไฟล์); component.css = หน้า Login แบบใหม่ (แยก selector กันด้วย theme-light-blue)
  styleUrls: ['./forgot-password-dialog.component.css', './forgot-password-dialog.light-base.css', './forgot-password-dialog.light.css']
})
export class ForgotPasswordDialogComponent implements OnInit, AfterViewInit, OnDestroy {

  /** 'light-blue' = เปิดจากหน้าโปรไฟล์ — หน้าตาเดิม (พื้นฟ้าอ่อน ปุ่มน้ำเงินเข้ม); 'dark' = หน้า Login (การ์ดครีมแบบใหม่) */
  @Input() theme: 'dark' | 'light-blue' = 'dark';
  /** โหมดบัญชี (login อยู่): อีเมลของบัญชี — แสดงแบบแก้ไม่ได้ และใช้ API ของหน้าโปรไฟล์ */
  @Input() accountEmail: string | null = null;
  /** success = ตั้งรหัสใหม่สำเร็จ (Login จะแสดงข้อความสำเร็จ) */
  @Output() closed = new EventEmitter<{ success: boolean }>();
  /** โหมดบัญชี: "← กลับไปยืนยันรหัสผ่าน" ในขั้นแรก */
  @Output() backToStart = new EventEmitter<void>();

  readonly steps = STEPS;
  step: Step = 'email';

  email = '';
  /** ค่า OTP ปัจจุบันจาก app-otp-input */
  otp = '';
  /** อายุรหัส (นาที) จาก backend — แสดงในคำอธิบายขั้น 2 */
  otpMinutes = 5;
  newPassword = '';
  confirmPassword = '';
  showNew = false;
  showConfirm = false;

  errors: FieldErrors<Field> = {};
  formError = '';
  infoMessage = '';
  isSubmitting = false;
  isResending = false;
  /** กำลังถาม "ปิดหน้าต่างนี้?" (ขั้น 2-3) */
  confirmingClose = false;

  /** วินาทีที่เหลือก่อนกด "ส่งรหัสอีกครั้ง" ได้ */
  cooldown = 0;
  /** reset token ชั่วคราวจาก verify-otp — เก็บในหน่วยความจำเท่านั้น */
  private resetToken = '';
  private submitted = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private previousBodyOverflow = '';
  private backdropPressed = false;

  @ViewChild('dialog') dialogRef!: ElementRef<HTMLElement>;
  @ViewChild(OtpInputComponent) otpInput?: OtpInputComponent;

  constructor(private authService: AuthService, private accounts: AccountService) {}

  get light(): boolean {
    return this.theme === 'light-blue';
  }

  get accountMode(): boolean {
    return !!this.accountEmail;
  }

  ngOnInit(): void {
    if (this.accountEmail) this.email = this.accountEmail;
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // ล็อก scroll หน้าหลัง
  }

  ngAfterViewInit(): void {
    this.focusStepStart();
  }

  ngOnDestroy(): void {
    this.stopTimer();
    document.body.style.overflow = this.previousBodyOverflow;
  }

  get stepIndex(): number {
    return STEPS.indexOf(this.step);
  }

  // ---------- เปิด/ปิด ----------

  /** X / Esc / backdrop: ขั้น 1 ปิดเลย, ขั้น 2-3 ถามยืนยันก่อน (ความคืบหน้าจะหาย) */
  requestClose(): void {
    if (this.confirmingClose) return;
    if (this.step === 'email') {
      this.closed.emit({ success: false });
      return;
    }
    this.confirmingClose = true;
    setTimeout(() => this.dialogRef?.nativeElement.querySelector<HTMLElement>('.fp-confirm-stay')?.focus());
  }

  confirmClose(): void {
    this.closed.emit({ success: false });
  }

  cancelClose(): void {
    this.confirmingClose = false;
    this.focusStepStart();
  }

  /** ปิดเมื่อทั้งกดและปล่อยเมาส์บน backdrop (ลากเลือกข้อความจากในกล่องออกมาแล้วปล่อยไม่ถือว่าปิด) */
  onBackdropMouseDown(event: MouseEvent): void {
    this.backdropPressed = event.target === event.currentTarget;
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.backdropPressed && event.target === event.currentTarget) {
      this.requestClose();
    }
    this.backdropPressed = false;
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.confirmingClose) {
        this.cancelClose();
      } else {
        this.requestClose();
      }
    } else if (event.key === 'Tab') {
      this.trapTab(event);
    }
  }

  /** focus หลุดออกนอก pop-up (เช่นคลิกหน้าหลัง/สลับหน้าต่าง) → ดึงกลับเข้ามา */
  @HostListener('document:focusin', ['$event'])
  onFocusIn(event: FocusEvent): void {
    const dialog = this.dialogRef?.nativeElement;
    if (dialog && event.target instanceof Node && !dialog.contains(event.target)) {
      this.focusables()[0]?.focus();
    }
  }

  // ---------- ย้อนกลับ ----------

  back(): void {
    if (this.step === 'otp') {
      this.setStep('email');
    } else if (this.step === 'reset') {
      // รหัสยืนยันเดิมถูกใช้ไปแล้ว (verify ผ่าน) → กลับไปขั้น 2 ต้องขอรหัสใหม่
      this.resetToken = '';
      this.newPassword = this.confirmPassword = '';
      this.otp = '';
      this.setStep('otp');
      this.infoMessage = 'รหัสยืนยันเดิมถูกใช้ไปแล้ว กด "ส่งรหัสอีกครั้ง" เพื่อรับรหัสใหม่';
    }
  }

  // ---------- ขั้น 1: อีเมล ----------

  sendCode(): void {
    if (this.isSubmitting) return;
    if (!this.check()) return;
    this.isSubmitting = true;
    // ไปขั้น 2 ได้เมื่อ backend ส่งเมลสำเร็จเท่านั้น (404 / 503 / 429 อยู่ขั้น 1 ต่อ)
    this.requestOtp().subscribe({
      next: (res) => {
        this.isSubmitting = false;
        this.infoMessage = '';
        this.otp = '';
        this.otpMinutes = Math.max(1, Math.round(res.expiresInSeconds / 60));
        this.startCooldown(res.cooldownSeconds);
        this.setStep('otp');
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting = false;
        this.applyError(err);
      }
    });
  }

  /** โหมดบัญชีส่งไปที่อีเมลของบัญชีเท่านั้น (backend ไม่รับอีเมลจาก request) */
  private requestOtp(): Observable<ForgotPasswordResponse> {
    return this.accountMode ? this.accounts.requestPasswordOtp() : this.authService.forgotPassword(this.email);
  }

  // ---------- ขั้น 2: OTP ----------

  onOtpChange(value: string): void {
    this.otp = value;
    this.onInput();
  }

  verify(): void {
    if (this.isSubmitting) return;
    if (!this.check()) return;
    this.isSubmitting = true;
    const verify$: Observable<VerifyOtpResponse> = this.accountMode
      ? this.accounts.verifyPasswordOtp(this.otp)
      : this.authService.verifyOtp(this.email, this.otp);
    verify$.subscribe({
      next: (res) => {
        this.isSubmitting = false;
        this.resetToken = res.resetToken;
        this.infoMessage = '';
        this.stopTimer();
        this.cooldown = 0;
        this.setStep('reset');
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting = false;
        const code = this.applyError(err);
        // รหัสนี้ใช้ต่อไม่ได้แล้ว → ล้างช่อง รอขอรหัสใหม่
        if (code === 'OTP_EXPIRED' || code === 'OTP_TOO_MANY_ATTEMPTS' || code === 'OTP_NOT_FOUND') {
          // clear() ส่งค่าว่าง → onInput ลบข้อความจาก backend ("รหัสยืนยันหมดอายุแล้ว…") แล้วขึ้น "กรุณากรอกรหัสยืนยัน" แทน — คงข้อความเดิมไว้
          const serverErrors = this.errors;
          const serverMessage = this.formError;
          this.otpInput?.clear();
          this.errors = serverErrors;
          this.formError = serverMessage;
        }
        setTimeout(() => this.otpInput?.focus(0));
      }
    });
  }

  resend(): void {
    if (this.cooldown > 0 || this.isResending) return;
    this.isResending = true;
    this.formError = '';
    this.requestOtp().subscribe({
      next: (res) => {
        this.isResending = false;
        this.otpInput?.clear();
        this.errors = {};
        this.submitted = false;
        this.infoMessage = 'ส่งรหัสยืนยันใหม่แล้ว รหัสเดิมจะใช้ไม่ได้';
        this.otpMinutes = Math.max(1, Math.round(res.expiresInSeconds / 60));
        this.startCooldown(res.cooldownSeconds);
        setTimeout(() => this.otpInput?.focus(0));
      },
      error: (err: HttpErrorResponse) => {
        this.isResending = false;
        this.applyError(err);
      }
    });
  }

  // ---------- ขั้น 3: รหัสใหม่ ----------

  resetPassword(): void {
    if (this.isSubmitting) return;
    if (!this.check()) return;
    this.isSubmitting = true;
    const reset$: Observable<unknown> = this.accountMode
      ? this.accounts.resetPassword(this.resetToken, this.newPassword, this.confirmPassword, this.authService.getRefreshToken())
      : this.authService.resetPassword(this.resetToken, this.newPassword, this.confirmPassword);
    reset$.subscribe({
      next: () => {
        this.resetToken = '';
        this.closed.emit({ success: true });
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting = false;
        this.applyError(err);
      }
    });
  }

  restart(): void {
    this.resetToken = '';
    this.newPassword = this.confirmPassword = '';
    this.otp = '';
    this.setStep('email');
  }

  // ---------- shared ----------

  /** validate หลังกดปุ่มครั้งแรกเท่านั้น แล้ว live ตอนพิมพ์ (ไม่ validate ตอน blur) */
  onInput(): void {
    if (this.submitted) {
      this.errors = this.validate();
    }
    this.formError = '';
  }

  private check(): boolean {
    this.submitted = true;
    this.formError = '';
    this.errors = this.validate();
    return !hasErrors(this.errors); // ช่องว่าง/ผิดรูปแบบ → ไม่ส่ง request
  }

  private validate(): FieldErrors<Field> {
    switch (this.step) {
      case 'email':
        return collectErrors<Field>({ email: emailError(this.email), otp: null, newPassword: null, confirmPassword: null });
      case 'otp':
        return collectErrors<Field>({ email: null, otp: otpError(this.otp), newPassword: null, confirmPassword: null });
      case 'reset':
        return collectErrors<Field>({
          email: null,
          otp: null,
          newPassword: passwordError(this.newPassword, 'กรุณากรอกรหัสผ่านใหม่'),
          confirmPassword: confirmPasswordError(this.newPassword, this.confirmPassword)
        });
    }
  }

  /**
   * แสดง error จาก backend. 404 → ใต้ช่องอีเมล (fieldErrors), 503 → ข้อความรวม,
   * 429 IP_RATE_LIMITED → "ลองใหม่อีกครั้งในอีกสักครู่" (ไม่ใช่ cooldown ของอีเมล),
   * 429 OTP_COOLDOWN / OTP_HOURLY_LIMIT → ตั้ง countdown ตาม Retry-After. คืน error code
   */
  private applyError(err: HttpErrorResponse): string | null {
    const e = this.authService.toFormError(err);
    this.errors = e.fields as FieldErrors<Field>;
    this.formError = e.message;
    this.infoMessage = '';
    if (err.status === 429) {
      if (e.code === 'IP_RATE_LIMITED') {
        this.formError = 'ลองใหม่อีกครั้งในอีกสักครู่';
      } else if (e.retryAfterSeconds) {
        this.startCooldown(e.retryAfterSeconds);
      }
    }
    return e.code;
  }

  private setStep(step: Step): void {
    this.step = step;
    this.errors = {};
    this.formError = '';
    this.infoMessage = '';
    this.submitted = false;
    this.focusStepStart();
  }

  private focusStepStart(): void {
    setTimeout(() => {
      const dialog = this.dialogRef?.nativeElement;
      const first = this.step === 'otp' ? '.auth-otp input' : this.step === 'reset' ? '#fp-new' : '#fp-email';
      dialog?.querySelector<HTMLElement>(first)?.focus();
    });
  }

  private focusables(): HTMLElement[] {
    const dialog = this.dialogRef?.nativeElement;
    if (!dialog) return [];
    return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter(el => !el.closest('[inert]') && (el.offsetParent !== null || el === document.activeElement));
  }

  /** Tab / Shift+Tab วนอยู่ใน pop-up */
  private trapTab(event: KeyboardEvent): void {
    const items = this.focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = !!active && this.dialogRef.nativeElement.contains(active);
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  }

  private startCooldown(seconds: number): void {
    this.stopTimer();
    this.cooldown = Math.max(0, Math.ceil(seconds));
    if (this.cooldown === 0) return;
    this.timer = setInterval(() => {
      this.cooldown--;
      if (this.cooldown <= 0) {
        this.stopTimer();
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
