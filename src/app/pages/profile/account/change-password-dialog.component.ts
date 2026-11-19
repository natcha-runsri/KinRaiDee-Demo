import {
  AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AccountService } from '../../../account.service';
import { AuthService } from '../../../auth.service';
import { FieldErrors, collectErrors, confirmPasswordError, hasErrors, otpError, passwordError } from '../../../auth.validators';
import { OtpInputComponent } from '../../../shared/otp-input/otp-input.component';

type Step = 'send' | 'otp' | 'reset';
type Field = 'otp' | 'newPassword' | 'confirmPassword';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]):not([readonly]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Pop-up เปลี่ยนรหัสผ่านด้วย OTP ทางอีเมล 3 ขั้น (หน้าโปรไฟล์, login อยู่): ส่งรหัส → กรอก OTP → ตั้งรหัสใหม่.
 * อีเมลคืออีเมลของบัญชี (แก้ไม่ได้) — backend ส่งไปที่อีเมลในบัญชีเท่านั้น. กฎ/โควตาเดียวกับลืมรหัสผ่าน.
 * ปิดด้วย X / Esc / backdrop / "ยกเลิก" — ขั้น 2-3 ถามยืนยันก่อน. หน้าบัญชีสร้าง/ทำลาย (@if) → เปิดใหม่เริ่มขั้น 1.
 * a11y: role=dialog, aria-modal, focus trap, ล็อก scroll หน้าหลัง; หน้าบัญชีคืน focus ไปที่ปุ่ม "แก้ไข".
 */
@Component({
  selector: 'app-change-password-dialog',
  standalone: true,
  imports: [FormsModule, OtpInputComponent],
  templateUrl: './change-password-dialog.component.html',
  styleUrl: './change-password-dialog.component.css'
})
export class ChangePasswordDialogComponent implements OnInit, AfterViewInit, OnDestroy {

  /** อีเมลของบัญชี (แสดงอย่างเดียว) */
  @Input({ required: true }) email = '';
  /** success = เปลี่ยนรหัสสำเร็จ */
  @Output() closed = new EventEmitter<{ success: boolean }>();

  step: Step = 'send';
  otp = '';
  otpMinutes = 5;
  newPassword = '';
  confirmPassword = '';
  showNew = false;
  showConfirm = false;

  errors: FieldErrors<Field> = {};
  formError = '';
  infoMessage = '';
  busy = false;
  resending = false;
  confirmingClose = false;
  cooldown = 0;

  /** token ชั่วคราวจาก verify-otp — เก็บในหน่วยความจำเท่านั้น */
  private resetToken = '';
  private submitted = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private previousOverflow = '';
  private backdropPressed = false;
  /** emit closed แล้ว — เลิกกัก focus (หน้าบัญชีจะคืน focus ให้ปุ่ม "แก้ไข" ก่อน pop-up หายจาก DOM) */
  private closing = false;

  @ViewChild('dialog') dialogRef!: ElementRef<HTMLElement>;
  @ViewChild(OtpInputComponent) otpInput?: OtpInputComponent;

  constructor(private accounts: AccountService, private auth: AuthService) {}

  ngOnInit(): void {
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  ngAfterViewInit(): void {
    this.focusStepStart();
  }

  ngOnDestroy(): void {
    this.stopTimer();
    document.body.style.overflow = this.previousOverflow;
  }

  // ---------- ปิด ----------

  requestClose(): void {
    if (this.confirmingClose) return;
    if (this.step === 'send') {
      if (!this.busy) this.close(false);
      return;
    }
    this.confirmingClose = true;
    setTimeout(() => this.dialogRef?.nativeElement.querySelector<HTMLElement>('.cp-confirm-stay')?.focus());
  }

  confirmClose(): void {
    this.close(false);
  }

  private close(success: boolean): void {
    this.closing = true;
    this.closed.emit({ success });
  }

  cancelClose(): void {
    this.confirmingClose = false;
    this.focusStepStart();
  }

  onBackdropMouseDown(event: MouseEvent): void {
    this.backdropPressed = event.target === event.currentTarget;
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.backdropPressed && event.target === event.currentTarget) this.requestClose();
    this.backdropPressed = false;
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.closing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.confirmingClose ? this.cancelClose() : this.requestClose();
    } else if (event.key === 'Tab') {
      this.trapTab(event);
    }
  }

  @HostListener('document:focusin', ['$event'])
  onFocusIn(event: FocusEvent): void {
    const dialog = this.dialogRef?.nativeElement;
    if (!this.closing && dialog && event.target instanceof Node && !dialog.contains(event.target)) {
      this.focusables()[0]?.focus();
    }
  }

  // ---------- ขั้น 1: ส่งรหัส ----------

  sendCode(): void {
    if (this.busy) return;
    this.busy = true;
    this.formError = '';
    this.accounts.requestPasswordOtp().subscribe({
      next: res => {
        this.busy = false;
        this.otpMinutes = Math.max(1, Math.round(res.expiresInSeconds / 60));
        this.startCooldown(res.cooldownSeconds);
        this.setStep('otp');
      },
      error: (err: HttpErrorResponse) => {
        this.busy = false;
        this.applyError(err); // 503 / 429 / ไม่มีอีเมล → อยู่ขั้น 1 ต่อ
      }
    });
  }

  // ---------- ขั้น 2: OTP ----------

  onOtpChange(value: string): void {
    this.otp = value;
    this.onInput();
  }

  verify(): void {
    if (this.busy || !this.check()) return;
    this.busy = true;
    this.accounts.verifyPasswordOtp(this.otp).subscribe({
      next: res => {
        this.busy = false;
        this.resetToken = res.resetToken;
        this.stopTimer();
        this.cooldown = 0;
        this.setStep('reset');
      },
      error: (err: HttpErrorResponse) => {
        this.busy = false;
        const code = this.applyError(err);
        if (code === 'OTP_EXPIRED' || code === 'OTP_TOO_MANY_ATTEMPTS' || code === 'OTP_NOT_FOUND') {
          // รหัสนี้ใช้ต่อไม่ได้แล้ว → ล้างช่องรอขอรหัสใหม่; clear() ทำให้ onInput ลบข้อความจาก backend — คงข้อความไว้
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
    if (this.cooldown > 0 || this.resending || this.busy) return;
    this.resending = true;
    this.formError = '';
    this.accounts.requestPasswordOtp().subscribe({
      next: res => {
        this.resending = false;
        this.otpInput?.clear();
        this.errors = {};
        this.submitted = false;
        this.infoMessage = 'ส่งรหัสยืนยันใหม่แล้ว รหัสเดิมจะใช้ไม่ได้';
        this.otpMinutes = Math.max(1, Math.round(res.expiresInSeconds / 60));
        this.startCooldown(res.cooldownSeconds);
        setTimeout(() => this.otpInput?.focus(0));
      },
      error: (err: HttpErrorResponse) => {
        this.resending = false;
        this.applyError(err);
      }
    });
  }

  // ---------- ขั้น 3: รหัสใหม่ ----------

  savePassword(): void {
    if (this.busy || !this.check()) return;
    this.busy = true;
    this.accounts.resetPassword(this.resetToken, this.newPassword, this.confirmPassword, this.auth.getRefreshToken())
      .subscribe({
        next: () => {
          this.resetToken = '';
          this.close(true);
        },
        error: (err: HttpErrorResponse) => {
          this.busy = false;
          this.applyError(err);
        }
      });
  }

  /** token หมดอายุ/ใช้แล้ว → เริ่มใหม่ที่ขั้น 1 */
  restart(): void {
    this.resetToken = '';
    this.newPassword = this.confirmPassword = '';
    this.otp = '';
    this.setStep('send');
  }

  // ---------- shared ----------

  /** validate หลังกดปุ่มครั้งแรก แล้ว live ตอนพิมพ์ */
  onInput(): void {
    if (this.submitted) this.errors = this.validate();
    this.formError = '';
  }

  private check(): boolean {
    this.submitted = true;
    this.formError = '';
    this.errors = this.validate();
    return !hasErrors(this.errors);
  }

  private validate(): FieldErrors<Field> {
    if (this.step === 'otp') {
      return collectErrors<Field>({ otp: otpError(this.otp), newPassword: null, confirmPassword: null });
    }
    if (this.step === 'reset') {
      return collectErrors<Field>({
        otp: null,
        newPassword: passwordError(this.newPassword, 'กรุณากรอกรหัสผ่านใหม่'),
        confirmPassword: confirmPasswordError(this.newPassword, this.confirmPassword)
      });
    }
    return {};
  }

  /** error จาก backend: รายช่อง / ข้อความรวม; 429 → แสดงเวลาที่ต้องรอ + countdown. คืน error code */
  private applyError(err: HttpErrorResponse): string | null {
    const e = this.auth.toFormError(err);
    const fields = e.fields as Record<string, string>;
    this.errors = collectErrors<Field>({
      otp: fields['otp'] ?? null,
      newPassword: fields['newPassword'] ?? null,
      confirmPassword: fields['confirmPassword'] ?? null
    });
    // ช่องที่ไม่มีในขั้นนี้ (เช่น email: บัญชีไม่มีอีเมล, resetToken) → ข้อความรวม
    const other = Object.entries(fields).filter(([k]) => !['otp', 'newPassword', 'confirmPassword'].includes(k));
    this.formError = other.length ? other[0][1] : e.message;
    this.infoMessage = '';
    if (err.status === 503) {
      this.formError = 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่ภายหลัง';
    } else if (err.status === 429 && e.retryAfterSeconds) {
      this.startCooldown(e.retryAfterSeconds);
      this.formError = `${e.message || 'ส่งคำขอถี่เกินไป'} (รออีก ${this.formatWait(e.retryAfterSeconds)})`;
    }
    return e.code;
  }

  private formatWait(seconds: number): string {
    return seconds >= 60 ? `${Math.ceil(seconds / 60)} นาที` : `${seconds} วินาที`;
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
      if (this.step === 'otp') {
        this.otpInput?.focus(0);
      } else {
        dialog?.querySelector<HTMLElement>(this.step === 'reset' ? '#cp-new' : '.cp-submit')?.focus();
      }
    });
  }

  private focusables(): HTMLElement[] {
    const dialog = this.dialogRef?.nativeElement;
    if (!dialog) return [];
    return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter(el => !el.closest('[inert]') && (el.offsetParent !== null || el === document.activeElement));
  }

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
      if (this.cooldown <= 0) this.stopTimer();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
