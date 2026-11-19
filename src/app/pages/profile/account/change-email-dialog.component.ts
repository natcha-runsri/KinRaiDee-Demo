import {
  AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Account, AccountService } from '../../../account.service';
import { AuthService } from '../../../auth.service';
import { emailError, otpError } from '../../../auth.validators';
import { OtpInputComponent } from '../../../shared/otp-input/otp-input.component';
import { ForgotPasswordDialogComponent } from '../../homes/login/forgot-password-dialog/forgot-password-dialog.component';

/** password = ยืนยันรหัสผ่าน (ขั้น 0), email / otp / done = ขั้น 1-3 ของแถบขั้นตอน, forgot = ลืมรหัสผ่าน (ธีมฟ้า) */
type Step = 'password' | 'email' | 'otp' | 'done' | 'forgot';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]):not([readonly]), a[href], [tabindex]:not([tabindex="-1"])';
const OTP_DEAD = ['OTP_EXPIRED', 'OTP_TOO_MANY_ATTEMPTS', 'OTP_NOT_FOUND'];

/**
 * Pop-up เปลี่ยน / เพิ่มอีเมล — ยืนยัน 2 ชั้น: รหัสผ่านปัจจุบัน (ได้ ticket) → อีเมลใหม่ → OTP ที่อีเมลใหม่ → เสร็จสิ้น.
 * แยกจากการบันทึกข้อมูลส่วนตัว (ข้อมูลที่แก้ค้างไม่ถูกแตะ). "ลืมรหัสผ่าน?" = เนื้อหาเปลี่ยนเป็น pop-up ลืมรหัสผ่าน
 * ธีมฟ้าในตำแหน่งเดิม (ไม่ซ้อน) โหมดบัญชี → ตั้งรหัสใหม่สำเร็จกลับมาขั้น 0.
 * ปิด: X / Esc / backdrop / "ยกเลิก" — ขั้น OTP ถามก่อน (ขั้นลืมรหัสผ่านใช้กฎของ pop-up นั้น). เปิดใหม่เริ่มขั้น 0 เสมอ.
 */
@Component({
  selector: 'app-change-email-dialog',
  standalone: true,
  imports: [FormsModule, OtpInputComponent, ForgotPasswordDialogComponent],
  templateUrl: './change-email-dialog.component.html',
  styleUrls: ['./change-email-dialog.component.css', './change-email-steps.css']
})
export class ChangeEmailDialogComponent implements OnInit, AfterViewInit, OnDestroy {

  /** อีเมลปัจจุบันของบัญชี — null = ยังไม่มี (เพิ่มอีเมล) */
  @Input() currentEmail: string | null = null;
  /** เปลี่ยนสำเร็จ (ยังอยู่ขั้นเสร็จสิ้น) — หน้าบัญชีอัปเดตอีเมลทันที */
  @Output() emailChanged = new EventEmitter<Account>();
  @Output() closed = new EventEmitter<void>();

  readonly stepLabels = ['อีเมลใหม่', 'รหัสยืนยัน', 'เสร็จสิ้น'];
  step: Step = 'password';

  password = '';
  showPassword = false;
  passwordError = '';
  /** ข้อความสีเขียวบนขั้น 0 (หลังตั้งรหัสใหม่) */
  passwordNotice = '';

  newEmail = '';
  emailError = '';
  /** อีเมลที่ส่ง OTP ไปจริง (normalize แล้ว) */
  sentTo = '';
  otp = '';
  otpMinutes = 5;
  otpError = '';
  infoMessage = '';

  formError = '';
  busy = false;
  resending = false;
  cooldown = 0;
  confirmingClose = false;

  private ticket = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  private previousOverflow = '';
  private backdropPressed = false;
  private closing = false;

  @ViewChild('dialog') dialogRef?: ElementRef<HTMLElement>;
  @ViewChild(OtpInputComponent) otpInput?: OtpInputComponent;

  constructor(private accounts: AccountService, private auth: AuthService) {}

  /** ตอนเปิด pop-up บัญชียังไม่มีอีเมล (เพิ่มอีเมล) — ล็อกไว้ตั้งแต่เปิด: เพิ่มสำเร็จแล้ว currentEmail จะเปลี่ยน
   *  แต่ข้อความขั้นเสร็จสิ้นต้องยังเป็น "เพิ่มอีเมล..." */
  adding = false;

  /** ลำดับในแถบขั้นตอน (0-2) — ขั้น 0 / ลืมรหัสผ่านไม่มีแถบ */
  get stepIndex(): number {
    return ['email', 'otp', 'done'].indexOf(this.step);
  }

  ngOnInit(): void {
    this.adding = !this.currentEmail;
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
    if (this.confirmingClose || this.step === 'forgot') return;
    if (this.step === 'otp') {
      this.confirmingClose = true;
      setTimeout(() => this.dialogRef?.nativeElement.querySelector<HTMLElement>('.ce-confirm-stay')?.focus());
      return;
    }
    if (!this.busy) this.close();
  }

  close(): void {
    this.closing = true;
    this.closed.emit();
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
    if (this.closing || this.step === 'forgot') return; // ขั้นลืมรหัสผ่าน: pop-up นั้นจัดการเอง
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
    if (!this.closing && this.step !== 'forgot' && dialog && event.target instanceof Node && !dialog.contains(event.target)) {
      this.focusables()[0]?.focus();
    }
  }

  // ---------- ขั้น 0: รหัสผ่าน ----------

  submitPassword(): void {
    if (this.busy) return;
    this.formError = '';
    if (!this.password) {
      this.passwordError = 'กรุณากรอกรหัสผ่าน';
      return;
    }
    this.busy = true;
    this.accounts.emailVerifyPassword(this.password).subscribe({
      next: res => {
        this.busy = false;
        this.ticket = res.ticket;
        this.password = '';
        this.passwordNotice = '';
        this.go('email');
      },
      error: (err: HttpErrorResponse) => {
        this.busy = false;
        const e = this.auth.toFormError(err);
        if (e.fields['currentPassword']) {
          this.passwordError = e.fields['currentPassword'];
        } else {
          this.formError = this.messageOf(err);
        }
      }
    });
  }

  onPasswordInput(): void {
    this.passwordError = '';
    this.formError = '';
  }

  openForgot(): void {
    if (this.busy) return;
    if (this.adding) {
      this.formError = 'บัญชีนี้ยังไม่มีอีเมล จึงกู้รหัสผ่านทางอีเมลไม่ได้';
      return;
    }
    this.passwordNotice = '';
    this.step = 'forgot';
  }

  onForgotClosed(result: { success: boolean }): void {
    if (result.success) {
      this.password = '';
      this.passwordError = '';
      this.formError = '';
      this.passwordNotice = 'ตั้งรหัสผ่านใหม่แล้ว กรุณายืนยันด้วยรหัสผ่านใหม่';
      this.go('password');
    } else {
      this.close(); // ปิดจากใน pop-up ลืมรหัสผ่าน = ปิดทั้งหมด
    }
  }

  backFromForgot(): void {
    this.go('password');
  }

  // ---------- ขั้น 1: อีเมลใหม่ ----------

  submitEmail(): void {
    if (this.busy) return;
    this.formError = '';
    const email = this.newEmail.trim().toLowerCase();
    this.emailError = emailError(this.newEmail) ?? (email === (this.currentEmail ?? '').toLowerCase()
      ? 'อีเมลนี้เป็นอีเมลปัจจุบันของคุณอยู่แล้ว' : '');
    if (this.emailError) return;
    this.sendOtp(email, false);
  }

  onEmailInput(): void {
    this.emailError = '';
    this.formError = '';
  }

  private sendOtp(email: string, resend: boolean): void {
    resend ? (this.resending = true) : (this.busy = true);
    this.accounts.emailSendOtp(this.ticket, email).subscribe({
      next: res => {
        this.busy = this.resending = false;
        this.sentTo = email;
        this.otpMinutes = Math.max(1, Math.round(res.expiresInSeconds / 60));
        this.startCooldown(res.cooldownSeconds);
        if (resend) {
          this.otpInput?.clear();
          this.otpError = '';
          this.formError = '';
          this.infoMessage = 'ส่งรหัสยืนยันใหม่แล้ว รหัสเดิมจะใช้ไม่ได้';
          setTimeout(() => this.otpInput?.focus(0));
        } else {
          this.go('otp');
        }
      },
      error: (err: HttpErrorResponse) => {
        this.busy = this.resending = false;
        if (this.ticketExpired(err)) return;
        const e = this.auth.toFormError(err);
        if (e.fields['newEmail']) {
          if (resend) this.go('email');
          this.emailError = e.fields['newEmail'];
        } else {
          this.formError = this.messageOf(err);
        }
      }
    });
  }

  // ---------- ขั้น 2: OTP ----------

  onOtpChange(value: string): void {
    this.otp = value;
    this.otpError = '';
    this.formError = '';
  }

  submitOtp(): void {
    if (this.busy) return;
    this.otpError = otpError(this.otp) ?? '';
    if (this.otpError) return;
    this.busy = true;
    this.accounts.emailConfirm(this.ticket, this.otp).subscribe({
      next: acc => {
        this.busy = false;
        this.ticket = '';
        this.stopTimer();
        this.emailChanged.emit(acc);
        this.go('done');
      },
      error: (err: HttpErrorResponse) => {
        this.busy = false;
        if (this.ticketExpired(err)) return;
        const e = this.auth.toFormError(err);
        if (e.fields['newEmail']) { // ถูกบัญชีอื่นใช้ไประหว่างรอ
          this.go('email');
          this.emailError = e.fields['newEmail'];
          return;
        }
        if (e.fields['otp'] || e.code?.startsWith('OTP_')) {
          // clear() ส่งค่าว่าง → onOtpChange ลบข้อความ — ล้างช่องก่อนแล้วค่อยแสดงข้อความจาก backend
          if (OTP_DEAD.includes(e.code ?? '')) this.otpInput?.clear();
          this.otpError = e.fields['otp'] || e.message;
          setTimeout(() => this.otpInput?.focus(0));
        } else {
          this.formError = this.messageOf(err);
        }
      }
    });
  }

  resend(): void {
    if (this.cooldown > 0 || this.resending || this.busy) return;
    this.sendOtp(this.sentTo, true);
  }

  /** "← ย้อนกลับ" → ขั้นอีเมล (อีเมลที่กรอกไว้ยังอยู่) */
  backToEmail(): void {
    if (this.busy) return;
    this.go('email');
  }

  // ---------- helpers ----------

  /** ticket หมดอายุ/ใช้แล้ว → กลับขั้น 0 พร้อมข้อความ */
  private ticketExpired(err: HttpErrorResponse): boolean {
    const e = this.auth.toFormError(err);
    if (e.code !== 'EMAIL_TICKET_INVALID' && !e.fields['ticket']) return false;
    this.ticket = '';
    this.stopTimer();
    this.cooldown = 0;
    this.go('password');
    this.formError = 'หมดเวลายืนยันตัวตน กรุณาเริ่มใหม่';
    return true;
  }

  private messageOf(err: HttpErrorResponse): string {
    const e = this.auth.toFormError(err);
    if (err.status === 503) return 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่ภายหลัง';
    if (err.status === 429 && e.retryAfterSeconds) {
      this.startCooldown(e.retryAfterSeconds);
      const wait = e.retryAfterSeconds >= 60 ? `${Math.ceil(e.retryAfterSeconds / 60)} นาที` : `${e.retryAfterSeconds} วินาที`;
      return `${e.message || 'ส่งคำขอถี่เกินไป'} (รออีก ${wait})`;
    }
    return e.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  }

  private go(step: Step): void {
    this.step = step;
    this.confirmingClose = false;
    this.formError = '';
    this.infoMessage = '';
    this.otpError = '';
    this.passwordError = '';
    if (step !== 'email') this.emailError = '';
    if (step === 'otp') this.otp = '';
    this.focusStepStart();
  }

  private focusStepStart(): void {
    setTimeout(() => {
      const dialog = this.dialogRef?.nativeElement;
      if (this.step === 'otp') {
        this.otpInput?.focus(0);
        return;
      }
      const target = { password: '#ce-password', email: '#ce-email', done: '.ce-submit', forgot: '' }[this.step];
      if (target) dialog?.querySelector<HTMLElement>(target)?.focus();
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
    const inside = !!active && !!this.dialogRef?.nativeElement.contains(active);
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
