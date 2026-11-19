import { MenuImageComponent } from '../../../shared/menu-image/menu-image.component';
import { AfterViewChecked, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { UserAvatarComponent } from '../../../shared/user-avatar/user-avatar.component';
import { AuthService } from '../../../auth.service';
import { AiChatResponse, AiChatTurn, AiMealGroup, AiRecipe, AiRecommendService } from '../../../ai-recommend.service';
import { AiChatStateService, ChatMessage, tokenExpired } from '../../../ai-chat-state.service';

const DEFAULT_CHIPS = ['เมนูอาหารเย็น', 'ของทอด', 'อาหารเผ็ด', 'ขอ 3 เมนูคลีน'];
const COUNTER_FROM = 250;

/**
 * แนะนำเมนูด้วย AI แบบแชต (/recommend/ai) — login และ guest ใช้ได้.
 * แชตอยู่ใน AiChatStateService ระดับ root: ไปหน้ารายละเอียดเมนู (แท็บเดิม) แล้วกดย้อนกลับ → แชต สถานะถูกใจ และตำแหน่ง scroll
 * กลับมาครบ; ผู้ใช้ที่ login รีเฟรชแล้วแชตยังอยู่ (sessionStorage ต่อ user id), guest รีเฟรช = ว่าง, เปลี่ยนผู้ใช้ = ล้าง.
 * conditionsToken หมดอายุ → "ขอเมนูอื่น" ของข้อความนั้นกดไม่ได้. ประวัติการแนะนำอยู่ใน DB (กันซ้ำยังทำงาน).
 * ลิงก์ไปหน้ารายละเอียดเปิดในแท็บเดิม — แท็บใหม่ไม่มี session ของผู้ใช้ที่ไม่ติ๊ก "จำฉัน" (sessionStorage แยกตามแท็บ)
 * ทุกข้อความแสดงเป็น text ธรรมดา ({{ }} — ไม่ render HTML)
 */
@Component({
  selector: 'app-ai-chat',
  standalone: true,
  imports: [MenuImageComponent, NavbarComponent, UserAvatarComponent, FormsModule, NgTemplateOutlet, RouterLink],
  templateUrl: './ai-chat.component.html',
  styleUrls: ['./ai-chat.component.css', './ai-chat-messages.css', './ai-chat-meals.css']
})
export class AiChatComponent implements OnInit, OnDestroy, AfterViewChecked {

  private api = inject(AiRecommendService);
  private state = inject(AiChatStateService);
  private router = inject(Router);
  readonly auth = inject(AuthService);
  private subs = new Subscription();
  private scrollPending = false;
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  /**
   * คีย์บอร์ดมือถือ: visualViewport หดแต่ layout viewport (ที่ sticky อิง) ไม่หด → ยกช่องพิมพ์ขึ้นเท่าส่วนที่ถูกบัง (--kb)
   */
  private readonly onViewport = () => {
    const vv = window.visualViewport;
    const kb = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    this.host.nativeElement.style.setProperty('--kb', `${kb}px`);
  };
  /** กลับมาจากหน้าอื่น → เลื่อนไปตำแหน่งเดิมหลัง render */
  private restoreScroll = 0;

  @ViewChild('thread') thread?: ElementRef<HTMLElement>;
  @ViewChild('input') input?: ElementRef<HTMLTextAreaElement>;

  readonly user = computed(() => this.auth.currentUser());
  chips = DEFAULT_CHIPS;
  maxLength = 300;
  busy = false;
  announcement = '';
  guestLikePrompt = false;

  /** ข้อความแชต / ข้อความที่พิมพ์ค้าง — อยู่ใน service (รอดการเปลี่ยนหน้า) */
  get messages(): ChatMessage[] { return this.state.messages; }
  get draft(): string { return this.state.draft; }
  set draft(v: string) { this.state.draft = v; this.state.save(); }

  readonly expiredHint = 'เงื่อนไขของคำตอบนี้หมดอายุแล้ว ลองพิมพ์ถามใหม่';

  /** "ขอเมนูอื่น" ได้เมื่อ conditionsToken ยังไม่หมดอายุ (backend เคยตอบว่าใช้ไม่ได้ → ปิดด้วย) */
  canMore(m: ChatMessage): boolean {
    return !!m.token && !m.tokenExpired && !tokenExpired(m.token);
  }

  ngOnInit(): void {
    // สถานะชั่วคราวของคำขอที่ค้าง (ปุ่มกำลังโหลด) ไม่ต้องคืนกลับ
    this.messages.forEach(m => { m.likeBusy = new Set(); m.groupBusy = undefined; });
    this.restoreScroll = this.messages.length ? this.state.scrollY : 0;
    window.visualViewport?.addEventListener('resize', this.onViewport);
    window.visualViewport?.addEventListener('scroll', this.onViewport);
    this.subs.add(this.api.config().subscribe({
      next: c => { this.chips = c.chips?.length ? c.chips : DEFAULT_CHIPS; this.maxLength = c.maxLength || 300; },
      error: () => { /* ใช้ค่าเริ่มต้น */ }
    }));
  }

  ngOnDestroy(): void {
    window.visualViewport?.removeEventListener('resize', this.onViewport);
    window.visualViewport?.removeEventListener('scroll', this.onViewport);
    this.state.scrollY = window.scrollY;
    this.subs.unsubscribe();
    // ออกจากหน้าระหว่างรอคำตอบ → คำขอถูกยกเลิก: แทนสถานะโหลดด้วยข้อความ ไม่ให้ค้างตอนกลับมา
    this.messages.forEach((m, i) => {
      if (m.loading) this.messages[i] = { role: 'assistant', text: 'ยังไม่ได้คำตอบเพราะออกจากหน้านี้ ลองถามใหม่อีกครั้งนะ', error: true };
    });
    this.state.save();
  }

  ngAfterViewChecked(): void {
    if (this.restoreScroll && this.thread) {
      const y = this.restoreScroll;
      this.restoreScroll = 0;
      this.scrollPending = false;
      // รอ layout (รูปเมนู/ภาพสำรอง) 1 เฟรมก่อนเลื่อน
      requestAnimationFrame(() => window.scrollTo({ top: y }));
      return;
    }
    if (this.scrollPending && this.thread) {
      this.scrollPending = false;
      const el = this.thread.nativeElement;
      el.scrollTop = el.scrollHeight;
      window.scrollTo({ top: document.documentElement.scrollHeight });
    }
  }

  get started(): boolean {
    return this.messages.length > 0;
  }

  get showCounter(): boolean {
    return this.draft.length >= COUNTER_FROM;
  }

  get canSend(): boolean {
    return !this.busy && this.draft.trim().length > 0 && this.draft.length <= this.maxLength;
  }

  // ---------- ส่งข้อความ ----------

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this.send();
    }
  }

  sendChip(chip: string): void {
    if (this.busy) return;
    this.draft = chip;
    this.send();
  }

  send(): void {
    const text = this.draft.trim();
    if (!text || this.busy || text.length > this.maxLength) return;
    const history = this.history();
    this.messages.push({ role: 'user', text });
    this.draft = '';
    this.request(this.api.ask(text, history));
  }

  more(msg: ChatMessage): void {
    if (this.busy || !this.canMore(msg)) return;
    this.request(this.api.more(msg.token!, this.history()), msg);
  }

  /**
   * "ขอเมนูอื่น" ของมื้อเดียว (คำขอหลายมื้อ): แทนที่เฉพาะการ์ดของมื้อนั้น — ส่งเมนูที่กำลังแสดงทุกมื้อไปด้วย (ไม่ซ้ำ)
   * ทำได้ทีละมื้อ; ไม่นับโควตา
   */
  moreMeal(msg: ChatMessage, g: AiMealGroup): void {
    if (this.busy || msg.groupBusy || !this.canMore(msg)) return;
    const showing = (msg.groups ?? []).flatMap(x => x.recipes.map(r => r.id));
    msg.groupBusy = g.meal;
    this.announcement = `กำลังหาเมนู${g.label}อื่นให้`;
    this.subs.add(this.api.moreMeal(msg.token!, g.meal, showing, this.history()).subscribe({
      next: r => {
        msg.groupBusy = undefined;
        const fresh = r.groups?.find(x => x.meal === g.meal);
        if (fresh) {
          g.recipes = fresh.recipes;
          g.notFound = fresh.notFound;
          msg.recipes = (msg.groups ?? []).flatMap(x => x.recipes);
        }
        this.announcement = fresh?.recipes.length
          ? `${g.label}: ${fresh.recipes.map(x => x.displayName).join(', ')}`
          : `ไม่พบเมนู${g.label}อื่นตามเงื่อนไขแล้ว`;
        this.state.save();
      },
      error: (err: HttpErrorResponse) => {
        msg.groupBusy = undefined;
        if (err.status === 400) { msg.tokenExpired = true; this.state.save(); }
        this.announcement = err.status === 400 ? this.expiredHint : 'ขอเมนูอื่นไม่สำเร็จ กรุณาลองใหม่';
      }
    }));
  }

  /** from = ข้อความที่กด "ขอเมนูอื่น" (400 = token ใช้ไม่ได้แล้ว → ปิดปุ่มของข้อความนั้น) */
  private request(obs: ReturnType<AiRecommendService['ask']>, from?: ChatMessage): void {
    const loading: ChatMessage = { role: 'assistant', text: '', loading: true };
    this.messages.push(loading);
    this.busy = true;
    this.scrollPending = true;
    this.state.save();
    this.subs.add(obs.subscribe({
      next: r => this.replace(loading, this.fromResponse(r)),
      error: (err: HttpErrorResponse) => {
        if (err.status === 429) {
          this.replace(loading, { role: 'assistant', text: 'วันนี้ถามครบแล้ว กลับมาใหม่พรุ่งนี้นะ', limitHit: true });
        } else {
          if (err.status === 400 && from) from.tokenExpired = true;
          const msg = err.status === 400 ? (err.error?.message || 'ส่งข้อความไม่สำเร็จ กรุณาลองใหม่')
            : 'ขอโทษนะ ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง';
          this.replace(loading, { role: 'assistant', text: msg, error: true });
        }
      }
    }));
  }

  private fromResponse(r: AiChatResponse): ChatMessage {
    const groups = r.groups?.length ? r.groups : undefined;
    // "ไม่พบเมนูสำหรับมื้อ…" แสดงในการ์ดของมื้อนั้นแล้ว → ไม่ซ้ำในรายการแจ้งเตือน
    const notices = groups ? r.notices.filter(n => !groups.some(g => g.notFound && n.startsWith('ไม่พบเมนูสำหรับ' + g.label)))
                           : r.notices;
    return { role: 'assistant', text: r.reply, recipes: r.recipes, notices, groups,
             token: r.recipes.length ? r.conditionsToken : undefined, likeBusy: new Set() };
  }

  private replace(loading: ChatMessage, msg: ChatMessage): void {
    const i = this.messages.indexOf(loading);
    if (i >= 0) this.messages[i] = msg;
    this.busy = false;
    this.state.save();
    this.scrollPending = true;
    const names = msg.recipes?.map(x => x.displayName).join(', ');
    this.announcement = msg.text + (names ? ' เมนู: ' + names : '');
    setTimeout(() => this.input?.nativeElement.focus());
  }

  /** ข้อความก่อนหน้าไม่เกิน 6 ข้อความ (ไม่รวมสถานะโหลด/ข้อความ error) */
  private history(): AiChatTurn[] {
    return this.messages.filter(m => !m.loading && !m.error && !m.limitHit && m.text)
      .map(m => ({ role: m.role, text: m.text }))
      .slice(-6);
  }

  // ---------- ถูกใจ ----------

  like(msg: ChatMessage, r: AiRecipe): void {
    if (r.liked || msg.likeBusy?.has(r.id)) return;
    if (!this.user()) {
      this.guestLikePrompt = true;
      setTimeout(() => document.querySelector<HTMLElement>('.mini-primary')?.focus());
      return;
    }
    msg.likeBusy?.add(r.id);
    this.subs.add(this.api.like(r.id).subscribe({
      next: () => { msg.likeBusy?.delete(r.id); r.liked = true; this.state.save(); this.announcement = `ถูกใจ ${r.displayName} แล้ว`; },
      error: () => { msg.likeBusy?.delete(r.id); this.announcement = 'บันทึกเมนูที่ชอบไม่สำเร็จ กรุณาลองใหม่'; }
    }));
  }

  guestLogin(): void {
    this.guestLikePrompt = false;
    void this.router.navigate(['/login'], { queryParams: { returnUrl: '/recommend/ai' } });
  }

  @HostListener('document:keydown.escape')
  closeGuestPrompt(): void {
    this.guestLikePrompt = false;
  }

  goLogin(): void {
    void this.router.navigate(['/login'], { queryParams: { returnUrl: '/recommend/ai' } });
  }

  menuLink(id: string): string[] {
    return ['/menu', id];
  }
}
