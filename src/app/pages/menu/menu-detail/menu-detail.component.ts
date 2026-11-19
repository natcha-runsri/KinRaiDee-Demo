import { MenuImageComponent } from '../../../shared/menu-image/menu-image.component';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { IngredientShopComponent } from './ingredient-shop.component';
import { IngredientProductView, RecipeDetailView, RecipeImageCredit, RecipeIngredientView, RecipeService, safeExternalUrl } from '../../../recipe.service';
import { AuthService } from '../../../auth.service';

const TOAST_MS = 3000;
const SHOP_OPEN_DELAY_MS = 200;   // ชี้เมาส์ค้างก่อนเปิดกล่อง
const SHOP_CLOSE_DELAY_MS = 300;  // ออกจากการ์ด+กล่องแล้วค่อยปิด
const SHEET_MAX_WIDTH = 600;      // แคบกว่านี้ = bottom sheet

/** วัตถุดิบหนึ่งรายการที่เตรียมไว้แสดง — idx = ลำดับในสูตร (ใช้ track + จำว่ารูปไหนเสีย) */
interface IngredientItem {
  ing: RecipeIngredientView;
  idx: number;
  href: string | null;
  src: string | null;
  /** สินค้าเปรียบเทียบ (BIGC → LOTUS) — ว่าง = ไม่มีสินค้า */
  products: IngredientProductView[];
}

/**
 * หน้ารายละเอียดเมนู (/menu/:id) — ใครก็เข้าดูได้.
 * หลักการ: ข้อมูลไหนมีให้แสดง ไม่มีให้ซ่อนทั้งส่วน (ไม่แสดงช่องว่าง/placeholder/0/ข้อความแต่ง).
 * toast "บันทึกเมนูที่ชอบแล้ว" เฉพาะตอนมาจากปุ่มถูกใจ (router state likedToast).
 * ปุ่มถูกใจใต้ชื่อเมนู: login → สลับถูกใจ/ยกเลิก (source DETAIL — นับเป็นมื้อของวันนั้นเหมือนถูกใจจากที่อื่น);
 * guest → pop-up ชวน login แล้วกลับมาหน้านี้พร้อม ?like=1 (ถูกใจให้ครั้งเดียว แล้วลบออกจาก URL)
 */
@Component({
  selector: 'app-menu-detail',
  standalone: true,
  imports: [MenuImageComponent, RouterLink, NavbarComponent, IngredientShopComponent],
  templateUrl: './menu-detail.component.html',
  styleUrls: ['./menu-detail.component.css', './menu-detail-sections.css', './menu-detail-like.css']
})
export class MenuDetailComponent implements OnInit, OnDestroy {

  recipe: RecipeDetailView | null = null;
  /** null = ยังไม่รู้ (guest หรือกำลังโหลด) */
  liked: boolean | null = null;
  likeBusy = false;
  likeError = '';
  guestLikePrompt = false;
  private pendingLike = false;
  loading = true;
  notFound = false;
  loadError = false;
  toast = '';
  /**
   * ส่วนประกอบแบ่ง 2 กลุ่ม (เปลี่ยนแค่การแสดงผล — ลำดับใน API/DB ไม่แตะ เพราะ AI ใช้ลำดับในสูตรบอกวัตถุดิบหลัก):
   * cards = มีสินค้า ≥1 ร้านและมีรูปที่โหลดได้, chips = ไม่มีสินค้า/รูปโหลดไม่ได้ทุกรูป. ภายในกลุ่มเรียงตามสูตร
   */
  ingredientCards: IngredientItem[] = [];
  ingredientChips: IngredientItem[] = [];
  /** idx → จำนวนรูปที่ลองแล้วโหลดไม่ได้ (รูปเดิมก่อน แล้วไล่รูปสินค้าแต่ละร้าน) */
  private brokenImages = new Map<number, number>();

  /** กล่องเปรียบเทียบสินค้า: เปิดได้ทีละกล่อง (idx ของวัตถุดิบ) */
  shopIdx: number | null = null;
  shopAnchor: HTMLElement | null = null;
  shopSheet = false;
  private shopByHover = false;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  private sub?: Subscription;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private recipes: RecipeService,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    const state = this.router.getCurrentNavigation()?.extras.state ?? history.state;
    if (state?.likedToast) {
      this.showToast('บันทึกเมนูที่ชอบแล้ว');
      // ไม่ให้ toast โผล่ซ้ำเมื่อรีเฟรช
      history.replaceState({ ...history.state, likedToast: false }, '');
    }
    if (this.route.snapshot.queryParamMap.get('like') !== null) {
      // ใช้ครั้งเดียว — ลบออกจาก URL ทันที (รีเฟรช/ย้อนกลับจะไม่ถูกใจซ้ำ)
      this.pendingLike = this.auth.isLoggedIn();
      void this.router.navigate([], { relativeTo: this.route, queryParams: { like: null },
        queryParamsHandling: 'merge', replaceUrl: true });
    }
    this.sub = this.route.paramMap.subscribe(p => this.load(p.get('id') ?? ''));
  }

  get loggedIn(): boolean {
    return this.auth.isLoggedIn();
  }

  onLike(): void {
    if (!this.recipe || this.likeBusy) return;
    if (!this.loggedIn) {
      this.guestLikePrompt = true;
      setTimeout(() => document.querySelector<HTMLElement>('.mini-primary')?.focus());
      return;
    }
    this.setLiked(!this.liked);
  }

  guestLogin(): void {
    const id = this.recipe?.id;
    this.guestLikePrompt = false;
    void this.router.navigate(['/login'], { queryParams: { returnUrl: `/menu/${id}?like=1` } });
  }

  closeGuestPrompt(): void {
    if (!this.guestLikePrompt) return;
    this.guestLikePrompt = false;
    setTimeout(() => document.querySelector<HTMLElement>('.like-btn')?.focus());
  }

  private setLiked(want: boolean): void {
    const id = this.recipe?.id;
    if (!id) return;
    this.likeBusy = true;
    this.likeError = '';
    this.recipes.setLiked(id, want).subscribe({
      next: () => {
        this.likeBusy = false;
        this.liked = want;
        this.showToast(want ? 'บันทึกเมนูที่ชอบแล้ว' : 'ยกเลิกถูกใจแล้ว');
      },
      error: () => {
        this.likeBusy = false;
        this.likeError = want ? 'บันทึกเมนูที่ชอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' : 'ยกเลิกถูกใจไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
      }
    });
  }

  private loadLike(id: string): void {
    this.liked = null;
    this.likeError = '';
    if (!this.loggedIn) return;
    this.recipes.likeStatus(id).subscribe({
      next: r => {
        this.liked = r.liked;
        if (this.pendingLike) {
          this.pendingLike = false;
          if (!r.liked) this.setLiked(true);
        }
      },
      error: () => { this.liked = null; }
    });
  }

  /** เครดิตรูปของเรา — รูป AI ต้องมีชื่อเครื่องมือ; รูปจากเว็บต้องมีช่างภาพ + ลิงก์ http(s) ไม่งั้นไม่แสดง */
  get imageCredit(): RecipeImageCredit | null {
    const c = this.recipe?.imageCredit;
    if (!c?.site) return null;
    if (c.ai) return { site: c.site, photographer: null, url: null, ai: true };
    const url = safeExternalUrl(c.url);
    return url ? { ...c, url, licenseUrl: safeExternalUrl(c.licenseUrl) } : null;
  }

  /**
   * ใบอนุญาตตระกูล CC BY (CC BY, CC BY-SA ทุกเวอร์ชัน) ต้องให้เครดิตครบ: ชื่อผู้สร้าง, ลิงก์หน้ารูป, ลิงก์ใบอนุญาต
   * และบอกว่าดัดแปลง → "ภาพโดย {ชื่อ} จาก {เว็บ} ใบอนุญาต {ใบอนุญาต} (ครอปและย่อขนาด)"
   */
  isByLicense(c: RecipeImageCredit): boolean {
    return !!c.photographer && /^CC\s+BY(-SA)?(\s|$)/i.test((c.license ?? '').trim());
  }

  /**
   * "ภาพโดย {ชื่อ} จาก {เว็บ} ({ใบอนุญาต})" หรือ "ภาพจาก {เว็บ} ({ใบอนุญาต})" เมื่อไม่มีชื่อ;
   * Magnific/Freepik ใช้ข้อความตามใบอนุญาต "designed by {ชื่อ} - {เว็บ}"
   */
  creditText(c: RecipeImageCredit): string {
    if (c.style === 'designed-by') return `designed by ${c.photographer} - ${c.site}`;
    const base = c.photographer ? `ภาพโดย ${c.photographer} จาก ${c.site}` : `ภาพจาก ${c.site}`;
    return c.license ? `${base} (${c.license})` : base;
  }

  /** ลิงก์บทความสูตรต้นทาง (aroifin.com) ใต้วิธีทำ — ลิงก์อย่างเดียว ไม่โหลดอะไรจากเว็บนั้น */
  get sourceUrl(): string | null {
    return safeExternalUrl(this.recipe?.sourceUrl);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.clearShopTimers();
  }

  private load(id: string): void {
    this.loading = true;
    this.brokenImages.clear();
    this.notFound = false;
    this.loadError = false;
    this.recipes.detail(id).subscribe({
      next: (r) => {
        this.recipe = r;
        this.loading = false;
        this.groupIngredients();
        this.loadLike(r.id);
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        this.recipe = null;
        this.groupIngredients();
        // 404 = ไม่มีเมนูนี้, 400 = id ไม่ใช่ UUID → ถือว่าไม่พบเหมือนกัน
        if (err.status === 404 || err.status === 400) {
          this.notFound = true;
        } else {
          this.loadError = true;
        }
      }
    });
  }

  get hasChips(): boolean {
    return !!this.recipe && (!!this.recipe.calories || this.recipe.highlights.length > 0);
  }

  get nutritionItems(): { label: string; value: number; icon: string }[] {
    const n = this.recipe?.nutrition;
    if (!n) return [];
    return [
      { label: 'Protein', value: n.proteinG, icon: 'protein' },
      { label: 'Carbohydrate', value: n.carbohydrateG, icon: 'carb' },
      { label: 'Fat', value: n.fatG, icon: 'fat' },
    ].filter((x): x is { label: string; value: number; icon: string } => x.value !== null && x.value !== undefined);
  }

  onImageError(item: IngredientItem): void {
    if (this.shopIdx === item.idx) this.closeShop(false);
    this.brokenImages.set(item.idx, (this.brokenImages.get(item.idx) ?? 0) + 1);
    this.groupIngredients();
  }

  // ---------- กล่องเปรียบเทียบสินค้า ----------
  // desktop: ชี้ค้าง 200ms เปิด / ออกจากการ์ดและกล่อง 300ms ปิด (เฉพาะกล่องที่เปิดด้วย hover)
  // กด (ทุกอุปกรณ์ + Enter/Space) = เปิด/ปิด, คลิกนอกกล่องปิด, Esc ปิดและคืน focus ที่การ์ด

  shopHoverIn(item: IngredientItem, el: HTMLElement, e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || window.innerWidth < SHEET_MAX_WIDTH) return;
    this.cancelClose();
    if (this.shopIdx === item.idx) return;
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.hoverTimer = setTimeout(() => this.openShop(item, el, true), SHOP_OPEN_DELAY_MS);
  }

  shopHoverOut(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    if (this.hoverTimer) { clearTimeout(this.hoverTimer); this.hoverTimer = null; }
    this.scheduleClose();
  }

  scheduleClose(): void {
    if (this.shopIdx === null || !this.shopByHover) return;
    this.cancelClose();
    this.closeTimer = setTimeout(() => this.closeShop(false), SHOP_CLOSE_DELAY_MS);
  }

  cancelClose(): void {
    if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
  }

  toggleShop(item: IngredientItem, el: HTMLElement, e: Event): void {
    e.stopPropagation();
    this.clearShopTimers();
    if (this.shopIdx === item.idx) {
      // เปิดค้างไว้จาก hover แล้วกด = ปักไว้ (ไม่ปิดตอนเมาส์ออก) แทนการปิดทันที
      if (this.shopByHover) { this.shopByHover = false; return; }
      this.closeShop(false);
      return;
    }
    this.openShop(item, el, false);
  }

  closeShop(returnFocus: boolean): void {
    const anchor = this.shopAnchor;
    this.clearShopTimers();
    this.shopIdx = null;
    this.shopAnchor = null;
    if (returnFocus) anchor?.focus();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.shopIdx !== null) this.closeShop(false);
  }

  /** Esc: ปิด pop-up ชวน login ก่อน แล้วค่อยกล่องเปรียบเทียบสินค้า */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.guestLikePrompt) this.closeGuestPrompt();
    else if (this.shopIdx !== null) this.closeShop(true);
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.shopIdx !== null && this.shopSheet !== window.innerWidth < SHEET_MAX_WIDTH) this.closeShop(false);
  }

  private openShop(item: IngredientItem, el: HTMLElement, byHover: boolean): void {
    this.hoverTimer = null;
    this.shopIdx = item.idx;
    this.shopAnchor = el;
    this.shopByHover = byHover;
    this.shopSheet = window.innerWidth < SHEET_MAX_WIDTH;
  }

  private clearShopTimers(): void {
    if (this.hoverTimer) { clearTimeout(this.hoverTimer); this.hoverTimer = null; }
    this.cancelClose();
  }

  /** วัตถุดิบนี้ตรงกับอาหารที่ผู้ใช้แพ้ (backend ส่งชื่อวัตถุดิบที่ตรงมาใน allergyMatches) */
  isAllergen(item: IngredientItem): boolean {
    return !!this.recipe?.allergyMatches?.includes(item.ing.name.trim());
  }

  private groupIngredients(): void {
    const items: IngredientItem[] = (this.recipe?.ingredients ?? []).map((ing, idx) => {
      // url ที่ไม่ใช่ http(s) → การ์ดสินค้ายังแสดง แต่ไม่มีปุ่ม "สนใจซื้อ" (ตัดสินที่ IngredientShopComponent)
      const products = ing.products ?? [];
      // รูปการ์ด = logic เดิม (imageUrl) ก่อน; โหลดไม่ได้ → ลองรูปสินค้าแต่ละร้าน
      const candidates = [ing.imageUrl, ...products.map(p => p.imageUrl)]
        .map(u => safeExternalUrl(u)).filter((u, i, a): u is string => !!u && a.indexOf(u) === i);
      return {
        ing,
        idx,
        href: safeExternalUrl(ing.linkUrl),
        src: candidates[this.brokenImages.get(idx) ?? 0] ?? null,
        products,
      };
    });
    // การ์ดรูป = มีสินค้าอย่างน้อย 1 ร้าน (และมีรูปที่โหลดได้); ที่เหลือเป็นป้าย
    this.ingredientCards = items.filter(x => x.products.length && x.src);
    this.ingredientChips = items.filter(x => !(x.products.length && x.src));
  }

  private showToast(message: string): void {
    this.toast = message;
    this.toastTimer = setTimeout(() => (this.toast = ''), TOAST_MS);
  }
}
