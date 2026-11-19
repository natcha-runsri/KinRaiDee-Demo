import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AllergenOptions, AllergyService, AllergyValue, NO_ALLERGIES } from '../../../allergy.service';
import { AllergyPickerComponent } from '../../../shared/allergy-picker/allergy-picker.component';

/**
 * แถว "อาหารที่แพ้" ในหน้าบัญชีของฉัน.
 * ดู: ป้ายสีแดงอ่อน (ไม่มี → "ไม่มี"). แก้: {@link AllergyPickerComponent} (ตัวเดียวกับขั้นที่ 2 ของ pop-up ความชอบ).
 * บันทึก/ยกเลิกใช้ปุ่มเดิมของหน้า (ส่งค่าใหม่ผ่าน valueChange); backend ตรวจซ้ำ (key, ≤10 รายการ, ≤30 ตัวอักษร).
 */
@Component({
  selector: 'app-allergy-field',
  standalone: true,
  imports: [AllergyPickerComponent],
  templateUrl: './allergy-field.component.html',
  styleUrl: './allergy-field.component.css'
})
export class AllergyFieldComponent implements OnInit {
  @Input() value: AllergyValue = NO_ALLERGIES;
  @Input() editing = false;
  @Output() valueChange = new EventEmitter<AllergyValue>();

  options: AllergenOptions | null = null;

  constructor(private allergies: AllergyService) {}

  ngOnInit(): void {
    this.allergies.options().subscribe({ next: o => (this.options = o), error: () => (this.options = null) });
  }

  label(key: string): string {
    return this.options?.items.find(i => i.key === key)?.label ?? key;
  }

  /** ป้ายที่แสดงในโหมดดู (มาตรฐานตามลำดับตัวเลือก แล้วตามด้วยที่เพิ่มเอง) */
  get viewLabels(): string[] {
    const order = this.options?.items.map(i => i.key) ?? [];
    const keys = [...this.value.keys].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return [...keys.map(k => this.label(k)), ...this.value.custom];
  }

  onChange(v: AllergyValue): void {
    this.value = v;
    this.valueChange.emit(v);
  }
}
