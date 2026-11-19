import { AfterViewInit, Component, OnInit, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { IngredientProductView, safeExternalUrl } from '../../../recipe.service';

const STORES: Record<IngredientProductView['store'], { label: string; logo: string }> = {
  BIGC: { label: 'Big C', logo: 'images/stores/bigc.png' },
  LOTUS: { label: "Lotus's", logo: 'images/stores/lotus.png' },
};
const GAP = 12;      // ระยะกล่อง ↔ การ์ด (รวมลูกศร)
const EDGE = 8;      // ระยะห่างขอบจอซ้าย/ขวา/บน

/**
 * กล่องเปรียบเทียบสินค้า Big C / Lotus's ของวัตถุดิบหนึ่งตัว (หน้ารายละเอียดเมนู).
 * desktop = popover ลอยเหนือการ์ด (ไม่พอ → ใต้การ์ด) ไม่ล้นขอบจอ; มือถือ (sheet) = แผ่นเลื่อนขึ้นจากล่าง + พื้นหลังแตะปิด.
 * เปิด/ปิด/hover/คีย์บอร์ดคุมที่ MenuDetailComponent — คอมโพเนนต์นี้แค่แสดงผลและจัดตำแหน่ง.
 */
@Component({
  selector: 'app-ingredient-shop',
  standalone: true,
  templateUrl: './ingredient-shop.component.html',
  styleUrl: './ingredient-shop.component.css'
})
export class IngredientShopComponent implements OnInit, AfterViewInit {
  @Input({ required: true }) ingredientName = '';
  @Input({ required: true }) products: IngredientProductView[] = [];
  /** id ของชื่อวัตถุดิบบนการ์ด (aria-labelledby) */
  @Input({ required: true }) labelledBy = '';
  /** การ์ดที่กล่องชี้ไป (ใช้จัดตำแหน่ง popover) */
  @Input() anchor: HTMLElement | null = null;
  @Input() sheet = false;
  @Output() closed = new EventEmitter<void>();
  @Output() boxEnter = new EventEmitter<void>();
  @Output() boxLeave = new EventEmitter<void>();

  @ViewChild('box') box?: ElementRef<HTMLElement>;

  placement: 'top' | 'bottom' = 'top';
  left = 0;
  arrowX = 0;
  positioned = false;
  brokenLogos = new Set<string>();

  ngOnInit(): void {
    // แผ่นล่างไม่ต้องวัดตำแหน่ง — แสดงทันที (ต้อง visible ก่อนจึงจะ focus ปุ่มปิดได้)
    if (this.sheet) this.positioned = true;
  }

  ngAfterViewInit(): void {
    if (this.sheet) {
      // แผ่นล่าง: focus ปุ่มปิด เพื่อให้ผู้ใช้คีย์บอร์ด/โปรแกรมอ่านจออยู่ในแผ่น
      queueMicrotask(() => this.box?.nativeElement.querySelector<HTMLElement>('.close-btn')?.focus());
    }
    // วัดหลังเรนเดอร์รอบแรก แล้วค่อยแสดง (กันกระพริบตำแหน่ง)
    requestAnimationFrame(() => this.position());
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  position(): void {
    if (this.sheet || !this.anchor || !this.box) return;
    const box = this.box.nativeElement;
    const host = box.offsetParent as HTMLElement | null;   // li ของการ์ด (position:relative)
    if (!host) return;
    const a = this.anchor.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    const w = box.offsetWidth;
    const vw = document.documentElement.clientWidth;
    const navH = (document.querySelector('app-navbar')?.getBoundingClientRect().bottom ?? 0);
    const topSpace = a.top - Math.max(navH, 0) - EDGE;
    this.placement = topSpace >= box.offsetHeight + GAP ? 'top' : 'bottom';
    const centerX = a.left + a.width / 2;
    const viewLeft = Math.min(Math.max(centerX - w / 2, EDGE), Math.max(EDGE, vw - w - EDGE));
    this.left = Math.round(viewLeft - h.left);
    this.arrowX = Math.round(Math.min(Math.max(centerX - viewLeft, 18), w - 18));
    this.positioned = true;
  }

  storeLabel(p: IngredientProductView): string {
    return STORES[p.store]?.label ?? p.store;
  }

  logo(p: IngredientProductView): string | null {
    return this.brokenLogos.has(p.store) ? null : STORES[p.store]?.logo ?? null;
  }

  url(p: IngredientProductView): string | null {
    return safeExternalUrl(p.url);
  }

  price(v: number): string {
    return '฿' + new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(v);
  }

  /** "ถูกกว่า" เฉพาะเมื่อมี 2 ร้าน ราคาครบ และไม่เท่ากัน */
  isCheaper(p: IngredientProductView): boolean {
    const priced = this.products.filter(x => x.price !== null && x.price !== undefined);
    if (this.products.length < 2 || priced.length < 2 || p.price === null || p.price === undefined) return false;
    const min = Math.min(...priced.map(x => x.price as number));
    return p.price === min && priced.some(x => x.price !== min);
  }

  get footnote(): string {
    const dates = this.products.map(p => p.collectedAt).filter((d): d is string => !!d).sort();
    if (!dates.length) return 'ราคาอาจเปลี่ยนแปลงได้';
    const d = new Date(dates[dates.length - 1] + 'T00:00:00');
    const th = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    return `ราคา ณ วันที่ ${th} อาจเปลี่ยนแปลงได้`;
  }
}
