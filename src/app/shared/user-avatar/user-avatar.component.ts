import { Component, Input, OnChanges } from '@angular/core';

/**
 * รูปโปรไฟล์วงกลม: มีรูป → แสดงรูป; ไม่มี/โหลดไม่ได้ → วงกลมสีครีม + ตัวอักษรแรกของชื่อ.
 * ใช้ทั้ง navbar และ sidebar หน้าโปรไฟล์.
 */
@Component({
  selector: 'app-user-avatar',
  standalone: true,
  template: `
    @if (url && !failed) {
      <img class="ua-img" [src]="url" [alt]="alt" [style.width.px]="size" [style.height.px]="size"
           referrerpolicy="no-referrer" (error)="failed = true">
    } @else {
      <span class="ua-initial" [style.width.px]="size" [style.height.px]="size"
            [style.font-size.px]="size * 0.42" role="img" [attr.aria-label]="alt">{{ initial }}</span>
    }
  `,
  styles: [`
    :host{ display:inline-flex; border-radius:50%; flex:none; }
    .ua-img{ display:block; border-radius:50%; object-fit:cover; background:#F5E6C8; }
    .ua-initial{
      display:flex; align-items:center; justify-content:center; border-radius:50%;
      background:#FFF3D6; color:var(--color-primary); font-family:'Prompt', sans-serif; font-weight:700;
      text-transform:uppercase; user-select:none;
    }
  `]
})
export class UserAvatarComponent implements OnChanges {
  @Input() url: string | null | undefined = null;
  @Input() name = '';
  @Input() size = 32;

  failed = false;

  get initial(): string {
    return (this.name || '?').trim().charAt(0) || '?';
  }

  get alt(): string {
    return `รูปโปรไฟล์ของ ${this.name}`;
  }

  ngOnChanges(): void {
    this.failed = false;
  }
}
