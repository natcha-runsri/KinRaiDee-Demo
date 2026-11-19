import {
  AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  FOOD_PREFERENCE_OPTIONS, FoodPreferenceKey, FoodPreferenceOption, FoodPreferenceService
} from '../../food-preference.service';
import { AllergyValue, NO_ALLERGIES } from '../../allergy.service';
import { AllergyPickerComponent } from '../allergy-picker/allergy-picker.component';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** ผลของ pop-up ทั้ง 2 ขั้น */
export interface FoodPreferenceChoice {
  preferences: FoodPreferenceKey[];
  allergies: AllergyValue;
}

/**
 * Pop-up 2 ขั้น ตอนกด "เริ่มสุ่มเมนู" / "ปรับความชอบ":
 * 1) "บอกเราหน่อย คุณชอบอาหารแบบไหน" — เลือกได้หลายข้อ (กดซ้ำ = ยกเลิก), "ไปกันต่อ" (≥ 1) → ขั้นที่ 2.
 *    ตัวเลือกที่ backend ซ่อน (GET /api/food-preferences/options เช่น "รสหวาน") ไม่แสดง/ไม่นับ/ไม่ส่ง — แสดงการ์ดเมื่อรู้ผลแล้ว
 * 2) "มีอาหารที่แพ้ไหม?" — ตัวเลือกมาตรฐานจาก GET /api/allergens + พิมพ์เพิ่มเอง (กฎเดียวกับหน้าโปรไฟล์) + "ไม่มีอาหารที่แพ้";
 *    ไม่บังคับเลือก. "ย้อนกลับ" → ขั้นที่ 1 (ค่าทั้งสองขั้นยังอยู่). "เริ่มสุ่มเมนู" → {@link confirmed}.
 * ไม่บันทึกเอง: หน้าที่เปิดเป็นคนบันทึก (login → PATCH /me + PUT ความชอบ, guest → หน่วยความจำ) แล้วคุม {@link busy} / {@link errorMessage}.
 * ปิดด้วย X / Esc / backdrop ขั้นไหนก็ได้ → {@link dismissed} (ไม่บันทึกทั้งสองขั้น).
 * a11y: role=dialog, aria-modal, focus trap, ย้าย focus ไปหัวข้อเมื่อเปลี่ยนขั้น, คืน focus ตอนปิด, ล็อก scroll หน้าหลัง.
 */
@Component({
  selector: 'app-food-preference-dialog',
  standalone: true,
  imports: [AllergyPickerComponent],
  templateUrl: './food-preference-dialog.component.html',
  styleUrls: ['./food-preference-dialog.component.css', './food-preference-allergy.css', './food-preference-mobile.css']
})
export class FoodPreferenceDialogComponent implements OnInit, AfterViewInit, OnDestroy {

  /** ค่าที่ติ๊กไว้ก่อน ("ปรับความชอบ" ของผู้ใช้ login) — guest ส่ง null เสมอ */
  @Input() initial: FoodPreferenceKey[] | null = null;
  /** อาหารที่แพ้ที่ติ๊กไว้ก่อน (login = จากโปรไฟล์, guest = จากหน่วยความจำ) */
  @Input() initialAllergies: AllergyValue | null = null;
  @Input() busy = false;
  @Input() errorMessage = '';
  @Output() confirmed = new EventEmitter<FoodPreferenceChoice>();
  @Output() dismissed = new EventEmitter<void>();

  options: FoodPreferenceOption[] = [];
  optionsReady = false;
  step: 1 | 2 = 1;
  selected = new Set<FoodPreferenceKey>();
  /** รูปไอคอนที่โหลดไม่ได้ → แสดง emoji แทน */
  brokenIcons = new Set<FoodPreferenceKey>();
  bannerBroken = false;
  /** ภาพต่อกันแถวเดียว — แสดงเฉพาะเมื่อโหลด banner.webp ไม่ได้ (มือถือ 3 รูปแรก) */
  readonly collage = ['clean', 'stirfry', 'noodle', 'soup', 'fried'];

  /** ขั้นที่ 2 — แก้ผ่าน app-allergy-picker (ตัวเดียวกับหน้าโปรไฟล์) */
  allergyValue: AllergyValue = NO_ALLERGIES;

  @ViewChild('dialog') dialogRef!: ElementRef<HTMLElement>;

  private previousOverflow = '';
  private previousFocus: HTMLElement | null = null;
  private backdropPressed = false;
  private hiddenSub?: Subscription;

  constructor(private foodPreferences: FoodPreferenceService) {}

  ngOnInit(): void {
    this.hiddenSub = this.foodPreferences.hiddenKeys().subscribe(hidden => {
      this.options = FOOD_PREFERENCE_OPTIONS.filter(o => !hidden.includes(o.key));
      (this.initial ?? []).filter(k => !hidden.includes(k)).forEach(k => this.selected.add(k));
      this.optionsReady = true;
    });
    this.allergyValue = {
      keys: [...(this.initialAllergies?.keys ?? [])], custom: [...(this.initialAllergies?.custom ?? [])]
    };
    this.previousFocus = document.activeElement as HTMLElement | null;
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.dialogRef?.nativeElement.querySelector<HTMLElement>('.fpd-card')?.focus());
  }

  ngOnDestroy(): void {
    this.hiddenSub?.unsubscribe();
    document.body.style.overflow = this.previousOverflow;
    const target = this.previousFocus;
    setTimeout(() => target?.isConnected && target.focus());
  }

  // ---------- ขั้นที่ 1 ----------

  toggle(key: FoodPreferenceKey): void {
    if (this.selected.has(key)) {
      this.selected.delete(key);
    } else {
      this.selected.add(key);
    }
  }

  isSelected(key: FoodPreferenceKey): boolean {
    return this.selected.has(key);
  }

  next(): void {
    if (this.busy || this.selected.size === 0) return;
    this.step = 2;
    this.focusTitle();
  }

  back(): void {
    if (this.busy) return;
    this.step = 1;
    this.focusTitle();
  }

  submit(): void {
    if (this.busy || this.selected.size === 0) return;
    this.confirmed.emit({
      // เรียงตามลำดับการ์ด (ค่าที่ส่ง backend คงที่ ไม่ขึ้นกับลำดับคลิก) — key อาหารที่แพ้ picker เรียงให้แล้ว
      preferences: this.options.map(o => o.key).filter(k => this.selected.has(k)),
      allergies: { keys: [...this.allergyValue.keys], custom: [...this.allergyValue.custom] }
    });
  }

  close(): void {
    if (!this.busy) this.dismissed.emit();
  }

  onIconError(option: FoodPreferenceOption): void {
    this.brokenIcons.add(option.key);
  }

  onBackdropMouseDown(event: MouseEvent): void {
    this.backdropPressed = event.target === event.currentTarget;
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.backdropPressed && event.target === event.currentTarget) {
      this.close();
    }
    this.backdropPressed = false;
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.key === 'Tab') {
      this.trapTab(event);
    }
  }

  @HostListener('document:focusin', ['$event'])
  onFocusIn(event: FocusEvent): void {
    const dialog = this.dialogRef?.nativeElement;
    if (dialog && event.target instanceof Node && !dialog.contains(event.target)) {
      dialog.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }
  }

  /** เปลี่ยนขั้น → focus หัวข้อของขั้นใหม่ (screen reader อ่านขั้นใหม่, ไม่หลุดไป body) */
  private focusTitle(): void {
    setTimeout(() => this.dialogRef?.nativeElement.querySelector<HTMLElement>('#fpd-title')?.focus());
  }

  private trapTab(event: KeyboardEvent): void {
    const dialog = this.dialogRef?.nativeElement;
    if (!dialog) return;
    const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = !!active && dialog.contains(active);
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  }
}
