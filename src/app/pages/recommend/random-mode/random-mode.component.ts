import { MenuImageComponent } from '../../../shared/menu-image/menu-image.component';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../auth.service';
import { FoodPreferenceKey, FoodPreferenceService } from '../../../food-preference.service';
import { BannerItem, RandomSpinService, RecipeCard, SpinQuota, SpinResult } from '../../../random-spin.service';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { FoodPreferenceChoice, FoodPreferenceDialogComponent } from '../../../shared/food-preference-dialog/food-preference-dialog.component';
import { AllergyValue, NO_ALLERGIES } from '../../../allergy.service';

const SLIDE_INTERVAL_MS = 3000;
/**
 * ตู้สุ่มแบบสล็อตแมชชีน: เปลี่ยนรูปทุก 70ms อย่างน้อย 1.4 วิ (จานหมุน 0.8°/ms) → ได้ผลแล้วชะลอ (รูปช้าลงตามสัดส่วน ROLL_SLOWDOWN_MS,
 * จานหมุนต่อแบบ ease-out จนหยุดตั้งตรงที่รอบเต็มถัดไป ≥ 1 รอบ) → เวลารวมราว 2.3–3.2 วิ → จานเด้ง + การ์ดผลค่อย ๆ ปรากฏ + confetti
 */
const ROLL_FAST_MS = 70;
const ROLL_MIN_MS = 1400;
const ROLL_DEG_PER_MS = 0.8;
const ROLL_SLOWDOWN_MS = [90, 120, 160, 210, 270, 340];
const CONFETTI_COLORS = ['#FFEBAC', '#A9C6F0', '#F28B82', '#FDD663', '#81C995', '#6E1E1E'];
const CONFETTI_MS = 1600;

/** 0 ≤ x < 1 จาก crypto — ตำแหน่ง/หน่วงเวลาของ confetti (ไม่ใช้ Math.random ตามกฎ SonarQube S2245) */
function rand(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ผลการสุ่มที่กำลังแสดง */
interface ShownResult {
  spinId: string | null;
  recipe: RecipeCard;
  liked: boolean;
}

/**
 * หน้าโหมดการสุ่มอาหาร (/recommend/random) — 2 สถานะในหน้าเดียว (URL ไม่เปลี่ยน):
 * ก่อนสุ่ม (การ์ด "สุ่มเมนูอร่อย") และผลการสุ่ม (การ์ดเมนู + ถูกใจ / สุ่มใหม่).
 * - ต้องมีความชอบก่อน: login → DB, guest → หน่วยความจำ. ไม่มี → pop-up; ปิดโดยไม่เลือก → home
 * - จำนวนครั้งที่เหลือมาจาก backend เสมอ; ปุ่มสุ่มส่ง request ทุกครั้ง ให้ backend ตัดสินโควตา
 * - ผลล่าสุดของวันนี้ดึงจาก GET latest → รีเฟรช / ย้อนกลับจากหน้ารายละเอียด เห็นเมนูเดิม
 * - ?like=<recipeId> (guest ที่ login เพื่อถูกใจ) → ถูกใจให้อัตโนมัติแล้วไปหน้ารายละเอียด
 */
@Component({
  selector: 'app-random-mode',
  standalone: true,
  imports: [MenuImageComponent, RouterLink, NavbarComponent, FoodPreferenceDialogComponent],
  templateUrl: './random-mode.component.html',
  // หน้าผลการสุ่ม / animation ตู้สุ่ม + มือถือ แยกไฟล์ (budget CSS ต่อไฟล์ 8kB)
  styleUrls: ['./random-mode.component.css', './random-result.css', './random-spin.css']
})
export class RandomModeComponent implements OnInit, OnDestroy {

  readonly loginReturnUrl = '/recommend/random';

  loggedIn = false;
  preferences: FoodPreferenceKey[] | null = null;
  view: 'pre' | 'result' = 'pre';
  result: ShownResult | null = null;
  /** ข้อความสำหรับ screen reader (aria-live) */
  announcement = '';
  /** ป้าย "เมนูแนะนำสำหรับคุณ" — โผล่หลังรูปหยุด */
  showBubble = false;

  // pop-up ความชอบ
  dialogOpen = false;
  adjusting = false;
  dialogInitial: FoodPreferenceKey[] | null = null;
  /** ขั้นที่ 2: login = จากโปรไฟล์, guest = จากหน่วยความจำ */
  dialogAllergies: AllergyValue | null = null;
  dialogBusy = false;
  dialogError = '';

  // โควตา (จาก backend เท่านั้น)
  quota: SpinQuota | null = null;
  quotaError = '';
  /** request สุ่มกำลังรอ response */
  spinning = false;
  spinError = '';
  /** backend ตอบ 429 ตอนกด "สุ่มใหม่" */
  limitReached = false;

  // ถูกใจ
  likeBusy = false;
  likeError = '';
  guestLikePrompt = false;

  // แบนเนอร์ + ตู้สุ่ม
  slides: BannerItem[] = [];
  current = 0;
  loaded = new Set<string>();
  paused = false;
  rolling = false;
  rollSrc: string | null = null;
  /** จานหมุน: มุม + transition ของช่วงนั้น (หยุดที่รอบเต็มเสมอ → รูปผลตั้งตรง) */
  dishAngle = 0;
  dishTransition = 'none';
  /** หลังหยุด: จานเด้ง, การ์ดผลค่อย ๆ ปรากฏ, confetti (ไม่เล่นเมื่อเปิดหน้ามาเจอผลเดิม / reduced motion) */
  landed = false;
  revealing = false;
  confetti: { style: string }[] = [];
  readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private timer: ReturnType<typeof setInterval> | null = null;
  private rollTimer: ReturnType<typeof setTimeout> | null = null;
  private effectTimers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private auth: AuthService,
    private foodPreferences: FoodPreferenceService,
    private api: RandomSpinService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loggedIn = this.auth.isLoggedIn();
    const pendingLike = this.route.snapshot.queryParamMap.get('like');
    if (pendingLike !== null) {
      // ใช้ครั้งเดียว — ลบออกจาก URL ทันที (รีเฟรช/ย้อนกลับจะไม่ถูกใจซ้ำ)
      void this.router.navigate([], { relativeTo: this.route, queryParams: { like: null },
        queryParamsHandling: 'merge', replaceUrl: true });
      if (this.loggedIn && UUID_RE.test(pendingLike)) {
        this.autoLikeAfterLogin(pendingLike);
        return;
      }
    }
    this.init();
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.stopRoll();
    this.effectTimers.forEach(clearTimeout);
  }

  /** ปุ่มทุกปุ่มกดไม่ได้ระหว่างรอ/หมุน */
  get busy(): boolean {
    return this.spinning || this.rolling;
  }

  get exhausted(): boolean {
    return this.quota !== null && this.quota.remaining <= 0;
  }

  // ---------- เริ่มต้น ----------

  private init(): void {
    if (!this.loggedIn) {
      this.preferences = this.foodPreferences.getGuest();
      this.preferences ? this.start() : this.openDialog(false);
      return;
    }
    this.foodPreferences.loadForUser().subscribe({
      next: (prefs) => {
        this.preferences = prefs;
        prefs ? this.start() : this.openDialog(false);
      },
      error: () => {
        this.loggedIn = false;
        this.preferences = this.foodPreferences.getGuest();
        this.preferences ? this.start() : this.openDialog(false);
      }
    });
  }

  private start(): void {
    this.loadQuota();
    this.loadBanner();
    this.loadLatest();
  }

  /** guest login เพื่อถูกใจเมนู → ถูกใจให้อัตโนมัติ (ไม่ตัดโควตา) → หน้ารายละเอียด; recipe ไม่มีจริง → ข้ามเงียบๆ */
  private autoLikeAfterLogin(recipeId: string): void {
    this.api.like(recipeId, null).subscribe({
      next: () => this.router.navigate(['/menu', recipeId], { state: { likedToast: true } }),
      error: () => this.init()
    });
  }

  private loadQuota(): void {
    this.quotaError = '';
    this.api.quota().subscribe({
      next: (q) => (this.quota = q),
      error: () => (this.quotaError = 'โหลดจำนวนสิทธิ์ไม่สำเร็จ กรุณารีเฟรชหน้า')
    });
  }

  /** มีผลของวันนี้ → แสดงหน้าผลทันที (ไม่เล่น animation) */
  private loadLatest(): void {
    this.api.latest().subscribe({
      next: (latest) => {
        if (latest && !this.result) {
          this.showResult({ spinId: latest.spinId, recipe: latest.recipe, liked: latest.liked }, false);
        }
      },
      error: () => {}
    });
  }

  // ---------- pop-up ความชอบ ----------

  openAdjust(): void {
    if (!this.busy) this.openDialog(true);
  }

  /** pop-up 2 ขั้น — login: ดึงอาหารที่แพ้จากโปรไฟล์มาติ๊กไว้ก่อนเปิด (โหลดไม่ได้ → ว่าง) */
  private openDialog(adjusting: boolean): void {
    this.adjusting = adjusting;
    this.dialogInitial = adjusting && this.loggedIn ? this.preferences : null;
    this.dialogError = '';
    if (!this.loggedIn) {
      this.dialogAllergies = this.foodPreferences.getGuestAllergies();
      this.dialogOpen = true;
      return;
    }
    this.foodPreferences.loadAllergiesForUser().subscribe({
      next: (a) => { this.dialogAllergies = a; this.dialogOpen = true; },
      error: () => { this.dialogAllergies = NO_ALLERGIES; this.dialogOpen = true; }
    });
  }

  onDialogConfirmed(choice: FoodPreferenceChoice): void {
    const keys = choice.preferences;
    if (!this.loggedIn) {
      this.foodPreferences.setGuest(keys);
      this.foodPreferences.setGuestAllergies(choice.allergies);
      this.applyPreferences(keys);
      return;
    }
    this.dialogBusy = true;
    this.dialogError = '';
    this.foodPreferences.saveForUserWithAllergies(keys, choice.allergies).subscribe({
      next: (saved) => {
        this.dialogBusy = false;
        this.applyPreferences(saved);
      },
      error: (err) => {
        this.dialogBusy = false;
        this.dialogError = this.saveError(err);
      }
    });
  }

  /** login: PATCH /me 400 (อาหารที่แพ้ผิด) → ข้อความจาก backend, อื่น ๆ → ข้อความทั่วไป */
  private saveError(err: unknown): string {
    const e = (err as { error?: { fieldErrors?: Record<string, string> } })?.error;
    return e?.fieldErrors?.['allergies'] ?? 'บันทึกความชอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
  }


  onDialogDismissed(): void {
    this.dialogOpen = false;
    if (!this.adjusting && !this.preferences) {
      void this.router.navigate(['/home']);
    }
  }

  private applyPreferences(keys: FoodPreferenceKey[]): void {
    const firstTime = !this.preferences;
    this.preferences = keys;
    this.dialogOpen = false;
    firstTime ? this.start() : this.loadBanner();
  }

  // ---------- สุ่ม ----------

  /** "กดเลย" (ก่อนสุ่ม) และ "สุ่มใหม่" (หน้าผล) — ส่ง request ทุกครั้ง ให้ backend ตัดสินโควตา */
  spin(): void {
    if (this.busy) return;
    this.spinning = true;
    this.spinError = '';
    this.limitReached = false;
    this.likeError = '';

    // N ล่าสุดจาก backend เป็น 0 → ยังส่ง request แต่ไม่หมุนจนกว่าจะรู้ผล (ส่วนใหญ่ได้ 429 = ไม่หมุนเลย)
    const rollNow = !this.reducedMotion && !this.exhausted;
    const roll = rollNow ? this.startRoll() : null;
    if (rollNow) this.centerDish();

    this.api.spin(this.loggedIn ? null : this.preferences).subscribe({
      next: (res: SpinResult) => {
        this.spinning = false;
        this.quota = { remaining: res.remaining, limit: res.limit, resetsAt: res.resetsAt };
        const shown = { spinId: res.spinId, recipe: res.recipe, liked: res.liked };
        if (this.reducedMotion) {
          this.showResult(shown, false);   // ไม่มีหมุน/เด้ง/confetti — แสดงผลทันที แล้วเลื่อนจอทันทีให้เห็นจาน + ปุ่ม
          this.later(() => this.revealIntoView('auto'), 0);
        } else {
          (roll ?? this.startRoll()).finish(shown);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.spinning = false;
        roll?.cancel();
        if (err.status === 429) {
          const body = err.error ?? {};
          this.quota = { remaining: 0, limit: this.quota?.limit ?? 0, resetsAt: body.resetsAt ?? this.quota?.resetsAt ?? '' };
          this.limitReached = this.view === 'result';
        } else {
          this.spinError = 'สุ่มไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
        }
      }
    });
  }

  /**
   * เริ่มหมุน: เปลี่ยนรูปจากชุดแบนเนอร์ (= เมนูที่แนะนำได้ ไม่มีอาหารที่แพ้, preload แล้ว) ทุก 70ms + จานหมุน;
   * finish(result) = ได้ผลแล้ว → หมุนให้ครบ ROLL_MIN_MS แล้วชะลอจนหยุดที่รูปเมนูจริง (preload ทันที);
   * cancel() = error → กลับไปแสดงรูปเดิม
   */
  private startRoll(): { finish: (r: ShownResult) => void; cancel: () => void } {
    this.stopTimer();
    this.showBubble = false;
    this.landed = false;
    this.revealing = false;
    this.confetti = [];
    this.rolling = true;
    // ชุดรูปคำนวณใหม่ทุกเฟรม — รูปแบนเนอร์ที่โหลดเสร็จระหว่างหมุนจะเข้ามาร่วมด้วย
    const pool = (): string[] => {
      const urls = this.slides.filter(s => this.loaded.has(s.id)).map(s => s.imageUrl).filter((u): u is string => !!u);
      return urls.length || !this.result?.recipe.imageUrl ? urls : [this.result.recipe.imageUrl];
    };
    const startedAt = Date.now();
    let i = 0;
    let pending: ShownResult | null = null;
    let slowStep = -1;
    let slowScale = 1;

    const swap = () => {
      const urls = pool();
      if (urls.length) {
        i = (i + 1) % urls.length;
        this.rollSrc = urls[i];
      }
    };
    const tick = () => {
      swap();
      if (pending && slowStep < 0 && Date.now() - startedAt >= ROLL_MIN_MS) {
        // ชะลอ: จานหมุนต่อแบบ ease-out (ความเร็วเริ่ม = ความเร็วเดิม) ไปหยุดที่รอบเต็มถัดไปที่ห่าง ≥ 1 รอบ;
        // ระยะเวลาชะลอ = 2 × ระยะ / ความเร็ว แล้วยืด/หดจังหวะเปลี่ยนรูปให้จบพร้อมกัน
        const target = Math.ceil((this.dishAngle + 360) / 360) * 360;
        const slowMs = (2 * (target - this.dishAngle)) / ROLL_DEG_PER_MS;
        slowScale = slowMs / ROLL_SLOWDOWN_MS.reduce((a, b) => a + b, 0);
        this.dishTransition = `transform ${Math.round(slowMs)}ms cubic-bezier(.5, 1, .89, 1)`;
        this.dishAngle = target;
        slowStep = 0;
      } else if (slowStep < 0) {
        this.dishTransition = `transform ${ROLL_FAST_MS}ms linear`;
        this.dishAngle += ROLL_DEG_PER_MS * ROLL_FAST_MS;
      }
      if (slowStep >= ROLL_SLOWDOWN_MS.length) {
        const done = pending!;
        this.stopRoll();
        this.showResult(done, true);
        return;
      }
      const delay = slowStep >= 0 ? Math.round(ROLL_SLOWDOWN_MS[slowStep++] * slowScale) : ROLL_FAST_MS;
      this.rollTimer = setTimeout(tick, delay);
    };
    swap();
    this.rollTimer = setTimeout(tick, ROLL_FAST_MS);

    return {
      finish: (r) => {
        pending = r;
        if (r.recipe.imageUrl) new Image().src = r.recipe.imageUrl; // preload รูปสุดท้ายทันที (ไม่มีรูปของเรา → ภาพสำรอง)
      },
      cancel: () => {
        this.stopRoll();
        if (this.view === 'result') {
          this.showBubble = true;
        } else {
          this.restartBannerTimer();
        }
      }
    };
  }

  private stopRoll(): void {
    if (this.rollTimer) {
      clearTimeout(this.rollTimer);
      this.rollTimer = null;
    }
    this.rolling = false;
    this.rollSrc = null;
    // มุมเป็นรอบเต็ม (หยุดปกติ) หรือหยุดกลางทาง (error) → กลับตั้งตรงทันที ไม่มีภาพกระตุก (รอบเต็มเท่ากับ 0°)
    this.dishTransition = 'none';
    this.dishAngle = 0;
  }

  private showResult(r: ShownResult, animate: boolean): void {
    this.stopTimer();
    this.result = r;
    this.view = 'result';
    this.limitReached = false;
    this.announcement = `เมนูแนะนำสำหรับคุณ: ${r.recipe.name}`;
    this.showBubble = !animate;
    this.landed = animate;
    this.revealing = animate;
    if (animate) {
      this.later(() => (this.showBubble = true), 60);
      this.burstConfetti();
      // การ์ดผลปรากฏครบแล้ว → ถ้าปุ่มยังอยู่นอกจอ เลื่อนให้เห็น (จานยังอยู่ในจอ)
      this.later(() => this.revealIntoView(), 650);
    }
  }

  private later(fn: () => void, ms: number): void {
    this.effectTimers.push(setTimeout(fn, ms));
  }

  /** confetti สั้น ๆ จากกลางจาน (ไม่เล่นเมื่อ reduced motion — showResult(animate) ไม่ถูกเรียกแบบ animate อยู่แล้ว) */
  private burstConfetti(): void {
    this.confetti = Array.from({ length: 26 }, (_, k) => {
      const angle = (k / 26) * Math.PI * 2 + rand() * .4;
      const dist = 90 + rand() * 90;
      const dx = Math.round(Math.cos(angle) * dist);
      const dy = Math.round(Math.sin(angle) * dist * .7 - 50);
      const color = CONFETTI_COLORS[k % CONFETTI_COLORS.length];
      const delay = Math.round(rand() * 120);
      const rot = Math.round(rand() * 720 - 360);
      return { style: `--dx:${dx}px; --dy:${dy}px; --rot:${rot}deg; --delay:${delay}ms; background:${color}` };
    });
    this.later(() => (this.confetti = []), CONFETTI_MS);
  }

  /** กดสุ่มตอนจานอยู่นอกจอ (มือถือ: ปุ่มอยู่ใต้จาน) → เลื่อนให้จานอยู่กลางจอ */
  private centerDish(): void {
    const dish = document.querySelector<HTMLElement>('.showcase .dish');
    if (!dish) return;
    const r = dish.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) {
      dish.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  /**
   * หลังเผยผล: จานหลุดขอบบน → เลื่อนขึ้นให้เห็นจาน; ปุ่มถูกใจ/สุ่มใหม่อยู่ใต้จอ → เลื่อนลงเท่าที่จำเป็น แต่ไม่ให้จานหลุดขอบบน
   * (reduced motion: เลื่อนทันที ไม่ smooth)
   */
  private revealIntoView(behavior: ScrollBehavior = 'smooth'): void {
    const dish = document.querySelector<HTMLElement>('.showcase .dish');
    const actions = document.querySelector<HTMLElement>('.result-card .actions');
    if (!dish || !actions) return;
    const top = dish.getBoundingClientRect().top - 8;
    const below = actions.getBoundingClientRect().bottom + 12 - innerHeight;
    const delta = top < 0 ? top : below > 0 ? Math.min(below, top) : 0;
    if (delta) window.scrollBy({ top: delta, behavior });
  }

  // ---------- ถูกใจ ----------

  /**
   * login: ยังไม่ถูกใจ → บันทึก (spinId + snapshot + source ที่ backend) → หน้ารายละเอียด + toast;
   *        ถูกใจแล้ว → ไปหน้ารายละเอียด. guest → pop-up ชวน login
   */
  onLike(): void {
    if (!this.result || this.likeBusy || this.busy) return;
    const recipeId = this.result.recipe.id;
    if (this.result.liked) {
      void this.router.navigate(['/menu', recipeId]);
      return;
    }
    if (!this.loggedIn) {
      this.guestLikePrompt = true;
      setTimeout(() => document.querySelector<HTMLElement>('.mini-primary')?.focus());
      return;
    }
    this.likeBusy = true;
    this.likeError = '';
    this.api.like(recipeId, this.result.spinId).subscribe({
      next: () => {
        this.likeBusy = false;
        if (this.result) this.result = { ...this.result, liked: true };
        void this.router.navigate(['/menu', recipeId], { state: { likedToast: true } });
      },
      error: () => {
        this.likeBusy = false;
        this.likeError = 'บันทึกเมนูที่ชอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
      }
    });
  }

  guestLogin(): void {
    const id = this.result?.recipe.id;
    this.guestLikePrompt = false;
    void this.router.navigate(['/login'], { queryParams: { returnUrl: `/recommend/random?like=${id}` } });
  }

  @HostListener('document:keydown.escape')
  closeGuestPrompt(): void {
    if (!this.guestLikePrompt) return;
    this.guestLikePrompt = false;
    setTimeout(() => document.querySelector<HTMLElement>('.like-btn')?.focus());
  }

  // ---------- แบนเนอร์ ----------

  private loadBanner(): void {
    this.stopTimer();
    this.api.banner(this.loggedIn ? null : this.preferences).subscribe({
      next: (items) => {
        this.slides = items.filter(i => !!i.imageUrl);
        this.current = 0;
        this.loaded.clear();
        // preload ทุกรูป — ตู้สุ่มใช้ชุดนี้ ต้องลื่น
        this.slides.forEach((_, idx) => this.preload(idx));
        this.restartBannerTimer();
      },
      error: () => (this.slides = [])
    });
  }

  private restartBannerTimer(): void {
    this.stopTimer();
    if (this.slides.length && this.view === 'pre') {
      this.timer = setInterval(() => this.tick(), SLIDE_INTERVAL_MS);
    }
  }

  onBannerEnter(): void {
    this.paused = true;
  }

  onBannerLeave(): void {
    this.paused = false;
  }

  private tick(): void {
    if (this.paused || document.hidden || this.slides.length < 2 || this.rolling) return;
    const next = (this.current + 1) % this.slides.length;
    if (this.loaded.has(this.slides[next].id)) {
      this.current = next;
    } else {
      this.preload(next);
    }
  }

  private preload(index: number): void {
    const item = this.slides[index];
    if (!item || !item.imageUrl || this.loaded.has(item.id)) return;
    const img = new Image();
    img.onload = () => this.loaded.add(item.id);
    img.onerror = () => this.dropSlide(item);
    img.src = item.imageUrl;
  }

  dropSlide(item: BannerItem): void {
    const idx = this.slides.indexOf(item);
    if (idx < 0) return;
    const currentItem = this.slides[this.current];
    this.slides = this.slides.filter(s => s !== item);
    this.loaded.delete(item.id);
    if (!this.slides.length) {
      this.stopTimer();
      return;
    }
    const keep = currentItem === item ? -1 : this.slides.indexOf(currentItem);
    this.current = keep >= 0 ? keep : idx % this.slides.length;
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
