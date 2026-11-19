import { Component, Input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { BmiResult } from '../../bmi';

/** ค่า BMI ทศนิยม 1 ตำแหน่ง + ป้ายระดับสีตาม tone (good เขียว / warn เหลือง / bad แดง); ไม่มีค่า → "-" */
@Component({
  selector: 'app-bmi-badge',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    @if (bmi) {
      <span class="bmi-value">{{ bmi.value | number:'1.1-1' }}</span>
      @if (bmi.category) { <span [class]="'bmi-pill tone-' + bmi.tone">{{ bmi.category }}</span> }
    } @else {
      <span class="bmi-value muted">-</span>
    }
  `,
  styles: [`
    :host{ display:inline-flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .bmi-value{ font-weight:700; font-size:inherit; color:inherit; }
    .bmi-value.muted{ color:#9a8f8f; font-weight:400; }
    .bmi-pill{ display:inline-block; padding:2px 12px; border-radius:999px; font-size:12.5px; font-weight:600; white-space:nowrap; }
    .tone-good{ background:#E3F5C9; color:#3d5a1a; }
    .tone-warn{ background:#FFE9A8; color:#7a5300; }
    .tone-bad{ background:#F7D2D5; color:var(--color-danger-text); }
  `]
})
export class BmiBadgeComponent {
  @Input() bmi: BmiResult | null = null;
}
