import { MenuImageComponent } from '../../../shared/menu-image/menu-image.component';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LikedRecipe } from '../../../history.service';

/**
 * การ์ดเมนูที่ถูกใจ (หน้า /history และ /history/liked): รูป, ชื่อสั้น, แคลอรี่ (ไม่มี → ซ่อน), "รายละเอียด ▸" → /menu/:id.
 * showUnlike → ปุ่ม "ยกเลิกถูกใจ" (หน้าที่เรียกเป็นคนถามยืนยัน)
 */
@Component({
  selector: 'app-liked-card',
  standalone: true,
  imports: [RouterLink, MenuImageComponent],
  template: `
    <article class="lc">
      <div class="lc-img">
        <app-menu-image [src]="item.recipe.imageUrl" [alt]="name"></app-menu-image>
      </div>
      <div class="lc-meta">
        <h3 class="lc-name" [title]="item.recipe.menuName">{{ name }}</h3>
        @if (item.calories) { <span class="lc-cal">{{ item.calories }}</span> }
      </div>
      <a class="lc-detail hit44" [routerLink]="['/menu', item.recipe.id]" [attr.aria-label]="'รายละเอียด ' + name">
        รายละเอียด <span aria-hidden="true">▸</span>
      </a>
      @if (showUnlike) {
        <button type="button" class="lc-unlike hit44" [disabled]="busy" (click)="unlike.emit(item)"
                [attr.aria-label]="'ยกเลิกถูกใจ ' + name">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.5 7.8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.4 0 5.5 3.3 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4z"/></svg>
          ยกเลิกถูกใจ
        </button>
      }
    </article>
  `,
  styles: [`
    :host{ display:block; min-width:0; }
    *{ box-sizing:border-box; }
    .lc{ display:flex; flex-direction:column; gap:8px; height:100%; }
    .lc-img{ aspect-ratio:1 / 1.12; border-radius:10px; overflow:hidden; background:#F3E3D6;
      display:flex; align-items:center; justify-content:center; }
    .lc-img app-menu-image{ width:100%; height:100%; }
    .lc-meta{ display:flex; align-items:baseline; justify-content:space-between; gap:6px; min-width:0; }
    .lc-name{ margin:0; font-size:15px; font-weight:700; color:#3a0c0c; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .lc-cal{ flex:none; font-size:11px; color:#B77A82; }
    .lc-detail, .lc-unlike{ display:flex; align-items:center; justify-content:center; gap:6px; width:100%;
      padding:7px 10px; border-radius:999px; font:inherit; font-size:13px; font-weight:600; text-decoration:none; cursor:pointer; }
    .lc-detail{ margin-top:auto; background:var(--color-primary); color:#fff; border:none; }
    .lc-detail:hover{ background:var(--color-primary-hover); }
    .lc-unlike{ border:1.5px solid var(--color-primary); background:transparent; color:var(--color-primary); }
    .lc-unlike:hover:not(:disabled){ background:#FCEBEC; }
    .lc-unlike:disabled{ opacity:.6; cursor:progress; }
    .lc-unlike svg{ width:15px; height:15px; fill:var(--color-danger); }
    .lc-detail:focus-visible, .lc-unlike:focus-visible{ outline:3px solid #A9C6F0; outline-offset:2px; }
    /* ตัวอักษรบนมือถือ (≤ 767px): ปุ่ม 14px, แคลอรี่ 12px */
    @media (max-width:767.98px){ .lc-detail, .lc-unlike{ font-size:14px; } .lc-cal{ font-size:12px; } }
  `]
})
export class LikedCardComponent {
  @Input({ required: true }) item!: LikedRecipe;
  @Input() showUnlike = false;
  @Input() busy = false;
  @Output() unlike = new EventEmitter<LikedRecipe>();


  get name(): string {
    return this.item.displayName || this.item.recipe.menuName;
  }
}
