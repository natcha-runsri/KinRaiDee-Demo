import { Component, ElementRef, EventEmitter, Input, Output, QueryList, ViewChildren } from '@angular/core';

/**
 * ช่อง OTP ทีละหลัก (ใช้ร่วมกัน: pop-up ลืมรหัสผ่านหน้า Login + เปลี่ยนรหัสผ่านหน้าโปรไฟล์).
 * พิมพ์แล้วขยับช่องเอง, Backspace ที่ช่องว่างถอยกลับ, ลูกศรซ้ายขวา, วางรหัสทีเดียว / autofill มือถือ, รับแค่ตัวเลข.
 * สไตล์อยู่ที่ shared/auth-form.css (.auth-otp; light = พื้นฟ้าอ่อนสำหรับ pop-up พื้นขาว).
 */
@Component({
  selector: 'app-otp-input',
  standalone: true,
  template: `
    <div class="auth-otp" [class.invalid]="invalid" [class.light]="light" role="group"
         [attr.aria-label]="'รหัสยืนยัน ' + length + ' หลัก'" (paste)="onPaste($event)">
      @for (d of digits; track $index) {
        <input #box type="text" inputmode="numeric" pattern="[0-9]*"
               [attr.id]="$index === 0 ? firstId : null"
               [attr.autocomplete]="$index === 0 ? 'one-time-code' : 'off'"
               [attr.aria-label]="'หลักที่ ' + ($index + 1)"
               [attr.aria-invalid]="invalid || null"
               [value]="d"
               (input)="onInput($index, $event)"
               (keydown)="onKeydown($index, $event)"
               (focus)="$any($event.target).select()">
      }
    </div>
  `,
  styles: [':host{ display:block; }']
})
export class OtpInputComponent {
  @Input() length = 6;
  @Input() invalid = false;
  @Input() light = false;
  /** id ของช่องหลักแรก — ให้ <label for> ของหน้าที่ใช้ผูกกับช่องได้ (กดป้ายแล้วโฟกัสช่องแรก) */
  @Input() firstId: string | null = null;
  /** ค่าปัจจุบัน (ต่อกันทุกช่อง) ทุกครั้งที่เปลี่ยน */
  @Output() valueChange = new EventEmitter<string>();

  digits: string[] = Array(6).fill('');

  @ViewChildren('box') boxes!: QueryList<ElementRef<HTMLInputElement>>;

  get value(): string {
    return this.digits.join('');
  }

  clear(): void {
    for (let i = 0; i < this.digits.length; i++) this.setDigit(i, '');
    this.valueChange.emit('');
  }

  /** focus ทันที (ไม่รอ setTimeout) — พิมพ์เร็วแล้วตัวถัดไปต้องลงช่องใหม่เสมอ */
  focus(index = 0): void {
    const box = this.boxes?.get(index)?.nativeElement;
    box?.focus();
    box?.select();
  }

  onInput(index: number, event: Event): void {
    const digits = (event.target as HTMLInputElement).value.replace(/\D/g, '');
    if (digits.length > 1) {
      this.fill(digits, index); // autofill จากมือถือ / พิมพ์เร็ว
      return;
    }
    this.setDigit(index, digits); // ตัดตัวที่ไม่ใช่เลขทิ้งทันที
    if (digits && index < this.digits.length - 1) this.focus(index + 1);
    this.valueChange.emit(this.value);
  }

  onKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits[index] && index > 0) {
      event.preventDefault();
      this.setDigit(index - 1, '');
      this.focus(index - 1);
      this.valueChange.emit(this.value);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      this.focus(index - 1);
    } else if (event.key === 'ArrowRight' && index < this.digits.length - 1) {
      event.preventDefault();
      this.focus(index + 1);
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const digits = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
    if (digits) this.fill(digits, 0);
  }

  private fill(digits: string, from: number): void {
    let i = from;
    for (const d of digits) {
      if (i >= this.digits.length) break;
      this.setDigit(i++, d);
    }
    this.focus(Math.min(i, this.digits.length - 1));
    this.valueChange.emit(this.value);
  }

  /**
   * เขียนทั้ง model และ DOM ทันที — [value] binding อัปเดตช้ากว่า 1 frame (eventCoalescing) และไม่เขียนทับ
   * ถ้าค่า model ไม่เปลี่ยน (เช่น พิมพ์ "12" ลงช่องที่เป็น "1") → DOM ค้างค่าผิดได้
   */
  private setDigit(index: number, digit: string): void {
    this.digits[index] = digit;
    const box = this.boxes?.get(index)?.nativeElement;
    if (box) box.value = digit;
  }
}
