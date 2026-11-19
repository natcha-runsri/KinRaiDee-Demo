import { Component, Input } from '@angular/core';

/**
 * รูปประกอบจาก public/images — ถ้ายังไม่มีไฟล์ (โหลดไม่ได้) แสดงกรอบเส้นประพร้อม path ที่ต้องวางไฟล์แทน
 */
@Component({
  selector: 'app-art-image',
  standalone: true,
  template: `
    @if (!missing) {
      <img [src]="src" [alt]="alt" (error)="missing = true">
    } @else {
      <div class="ph" [attr.aria-hidden]="alt ? null : 'true'" [attr.role]="alt ? 'img' : null" [attr.aria-label]="alt || null">
        <span>{{ src }}</span>
      </div>
    }
  `,
  styles: [`
    :host{ display:block; }
    img{ width:100%; height:100%; object-fit:cover; display:block; border-radius:inherit; }
    .ph{ width:100%; height:100%; min-height:60px; display:flex; align-items:center; justify-content:center; padding:6px;
      border:2px dashed #D9A9A9; border-radius:inherit; background:rgba(255,255,255,.55); color:#9a6b6b;
      font:500 11px 'Prompt', sans-serif; text-align:center; word-break:break-all; box-sizing:border-box; }
  `]
})
export class ArtImageComponent {
  @Input({ required: true }) src!: string;
  @Input() alt = '';
  missing = false;
}
