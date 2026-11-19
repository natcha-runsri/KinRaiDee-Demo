import { Component, ElementRef, EventEmitter, HostBinding, Input, OnInit, Output, ViewChild } from '@angular/core';
import { AllergenOptions, AllergyService, AllergyValue, NO_ALLERGIES } from '../../allergy.service';

/** emoji เล็ก ๆ ต่อตัวเลือก (key จาก allergens.yml — key ใหม่ที่ไม่มีในนี้แสดง ⚠️) */
const ALLERGEN_EMOJI: Record<string, string> = {
  shrimp: '🦐', crab: '🦀', shellfish: '🦪', fish: '🐟', peanut: '🥜',
  soy: '🫘', milk: '🥛', egg: '🥚', wheat: '🌾', sesame: '🥯'
};

/**
 * ตัวเลือกอาหารที่แพ้ (ใช้ทั้งหน้าโปรไฟล์และขั้นที่ 2 ของ pop-up ความชอบ): ป้ายตัวเลือกมาตรฐานจาก GET /api/allergens
 * กดเลือก/ยกเลิก + ช่องพิมพ์เพิ่มเอง (Enter = เพิ่มเป็นป้าย, ✕ = ลบ, ≤ customMaxItems รายการ, ≤ customMaxLength ตัวอักษร)
 * + ข้อความเตือน. showNone → ปุ่ม "ไม่มีอาหารที่แพ้" (ล้างทั้งหมด; เลือก/เพิ่มอย่างอื่นแล้วหลุดเอง).
 * ล้างช่องพิมพ์ที่ DOM โดยตรงหลังเพิ่ม: ด้วย eventCoalescing พิมพ์แล้วกด Enter เร็ว ๆ CD ยังไม่ทันรัน — binding ([value]/ngModel)
 *   เห็นค่าเดิม '' → '' ไม่เปลี่ยน จึงไม่เขียนค่าว่างกลับ (ข้อความค้างในช่อง).
 * ไม่บันทึกเอง — ส่งค่าใหม่ผ่าน valueChange (backend ตรวจซ้ำ)
 */
@Component({
  selector: 'app-allergy-picker',
  standalone: true,
  templateUrl: './allergy-picker.component.html',
  styleUrl: './allergy-picker.component.css'
})
export class AllergyPickerComponent implements OnInit {
  @Input() value: AllergyValue = NO_ALLERGIES;
  /** prefix ของ id ช่องพิมพ์/ข้อความ ({prefix}-add, {prefix}-error, {prefix}-note) — ไม่ซ้ำในหน้าเดียวกัน */
  @Input() idPrefix = 'allergy';
  @Input() showNone = false;
  @Input() showEmoji = false;
  /** profile = ชิดซ้ายในฟอร์ม, popup = กึ่งกลาง ป้ายใหญ่ขึ้น (สไตล์ pop-up ความชอบ) */
  @Input() variant: 'profile' | 'popup' = 'profile';
  @Output() valueChange = new EventEmitter<AllergyValue>();

  @ViewChild('addInput') addInput?: ElementRef<HTMLInputElement>;

  @HostBinding('class.popup') get popup(): boolean { return this.variant === 'popup'; }

  options: AllergenOptions | null = null;
  loadError = false;
  none = false;
  draft = '';
  error = '';

  constructor(private allergies: AllergyService) {}

  ngOnInit(): void {
    this.allergies.options().subscribe({ next: o => (this.options = o), error: () => (this.loadError = true) });
  }

  get maxItems(): number { return this.options?.customMaxItems ?? 10; }
  get maxLength(): number { return this.options?.customMaxLength ?? 30; }

  emoji(key: string): string {
    return ALLERGEN_EMOJI[key] ?? '⚠️';
  }

  selected(key: string): boolean {
    return this.value.keys.includes(key);
  }

  toggle(key: string): void {
    const keys = this.selected(key) ? this.value.keys.filter(k => k !== key) : this.ordered([...this.value.keys, key]);
    if (!this.selected(key)) this.none = false;
    this.emit({ ...this.value, keys });
  }

  chooseNone(): void {
    this.none = true;
    this.clearInput();
    this.error = '';
    this.emit({ keys: [], custom: [] });
  }

  add(): void {
    const v = this.draft.trim().replace(/\s+/g, ' ');
    this.error = '';
    if (!v) return;
    if ([...v].length > this.maxLength) { this.error = `แต่ละรายการยาวไม่เกิน ${this.maxLength} ตัวอักษร`; return; }
    if (this.value.custom.includes(v)) { this.clearInput(); return; }
    if (this.value.custom.length >= this.maxItems) { this.error = `เพิ่มเองได้ไม่เกิน ${this.maxItems} รายการ`; return; }
    this.none = false;
    this.emit({ ...this.value, custom: [...this.value.custom, v] });
    this.clearInput();
  }

  private clearInput(): void {
    this.draft = '';
    if (this.addInput) this.addInput.nativeElement.value = '';
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();   // ไม่ส่งฟอร์มของหน้า
      e.stopPropagation();
      this.add();
    }
  }

  remove(item: string): void {
    this.error = '';
    this.emit({ ...this.value, custom: this.value.custom.filter(c => c !== item) });
  }

  /** key เรียงตามลำดับตัวเลือก (ค่าที่ส่ง backend คงที่ ไม่ขึ้นกับลำดับคลิก) */
  private ordered(keys: string[]): string[] {
    const order = this.options?.items.map(i => i.key) ?? [];
    return [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }

  private emit(v: AllergyValue): void {
    this.value = v;
    this.valueChange.emit(v);
  }
}
