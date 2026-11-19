import { Component, Input, OnChanges } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * รูปเมนู (ใช้ทุกจุดที่แสดงรูปเมนู). ไม่มี url / ไม่ใช่ http(s) / โหลดไม่ได้ (เช่น aroifin.com ตอบหน้า SG-Captcha แทนรูป)
 * → ภาพสำรองสไตล์ KinRai (พื้นครีม + ไอคอนจาน) แทนไอคอนรูปเสียและข้อความ alt ยาว ๆ.
 * environment.loadExternalMenuImages = false → รูปจาก externalMenuImageHosts ไม่โหลดเลย (ภาพสำรองทันที).
 * ขนาด/มุมโค้งกำหนดที่ host จากหน้าที่ใช้ (รูปเต็ม host, object-fit: cover)
 */
@Component({
  selector: 'app-menu-image',
  standalone: true,
  template: `
    @if (url && !broken) {
      <img [src]="url" [alt]="alt" [attr.loading]="eager ? null : 'lazy'" referrerpolicy="no-referrer" (error)="broken = true">
    } @else {
      <div class="fallback" role="img" [attr.aria-label]="alt ? alt + ' (ไม่มีรูป)' : 'ไม่มีรูปเมนู'">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="34" r="20"/>
          <circle cx="32" cy="34" r="12"/>
          <path d="M8 12v12a4 4 0 004 4v24M12 12v10M16 12v12a4 4 0 01-4 4M54 12c-4 2-6 8-6 14h6v26"/>
        </svg>
      </div>
    }
  `,
  styles: [`
    :host{ display:block; overflow:hidden; }
    img{ width:100%; height:100%; object-fit:cover; display:block; border-radius:inherit; }
    .fallback{ width:100%; height:100%; min-height:48px; display:flex; align-items:center; justify-content:center;
      background:#FBF3E6; border-radius:inherit; box-sizing:border-box; }
    svg{ width:38%; max-width:96px; min-width:24px; height:auto; fill:none; stroke:#C9A27E; stroke-width:2.5;
      stroke-linecap:round; stroke-linejoin:round; }
  `]
})
export class MenuImageComponent implements OnChanges {
  @Input() src: string | null | undefined = null;
  @Input() alt = '';
  /** รูปหลักที่อยู่บนจอทันที (hero/ผลสุ่ม) → ไม่ lazy */
  @Input() eager = false;

  url: string | null = null;
  broken = false;

  ngOnChanges(): void {
    this.broken = false;
    this.url = MenuImageComponent.safe(this.src);
  }

  private static safe(u: string | null | undefined): string | null {
    if (!u) return null;
    if (u.startsWith('images/') || u.startsWith('/images/')) return u;   // ไฟล์ใน public (รูปทดสอบ/ตกแต่ง)
    try {
      const p = new URL(u);
      if (p.protocol !== 'http:' && p.protocol !== 'https:') return null;
      // ปิดโหลดรูปจากเว็บต้นทาง (aroifin.com) → ภาพสำรองทันที ไม่ยิงคำขอ
      if (!environment.loadExternalMenuImages && MenuImageComponent.isExternalSource(p.hostname)) return null;
      return p.href;
    } catch {
      return null;
    }
  }

  private static isExternalSource(hostname: string): boolean {
    const h = hostname.toLowerCase();
    return environment.externalMenuImageHosts.some(d => h === d || h.endsWith('.' + d));
  }
}
