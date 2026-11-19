import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, ViewChild, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AdminService, CreditInput, ImageCredit, MenuDetail } from '../../../admin.service';
import { AuthService } from '../../../auth.service';
import { MenuImageComponent } from '../../../shared/menu-image/menu-image.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';

type Part = 'visibility' | 'display' | 'image';
type CreditKind = 'stock' | 'designed-by' | 'ai' | 'web' | '';

/** กติกาเดียวกับ backend ImageCredits / checklist (common.py) */
const STOCK = ['Unsplash', 'Pexels', 'Pixabay'];
const DESIGNED_BY = ['Magnific', 'Freepik'];
const AI_TOOLS = ['Microsoft Designer', 'Canva', 'Gemini', 'ChatGPT', 'Adobe Firefly', 'DALL-E', 'Midjourney', 'Copilot',
  'Bing Image Creator', 'Ideogram', 'Leonardo', 'Stable Diffusion', 'Imagen', 'Flux', 'Grok'];
const MAX_BYTES = 5 * 1024 * 1024;
/** รูปใหญ่กว่านี้ (ด้านยาว) ย่อในเบราว์เซอร์ก่อนส่ง — รูปที่ใช้จริง 1200px; Cloudinary แผนฟรีไม่รับเกิน 25 ล้านพิกเซล */
const MAX_SIDE = 2400;
/** กติกาเดียวกับ backend AdminMenuService (MAX_NAME / MAX_TAG / MAX_TAGS) — นับแบบ code point เหมือน backend */
const MAX_NAME = 60;
const MAX_TAG = 50;
const MAX_TAGS = 30;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TH_DT = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

/**
 * แผงรายละเอียด/แก้ไขเมนู (หน้า /admin/menus) — ทุกการแก้เป็นชั้นทับ (ค่าต้นทางไม่หาย, ย้อนกลับได้) และบันทึกประวัติ.
 * จอแคบ = เต็มจอ; Esc / ปุ่มปิด / กดพื้นหลัง = ปิด
 */
@Component({
  selector: 'app-admin-menu-detail',
  standalone: true,
  imports: [FormsModule, MenuImageComponent, ConfirmDialogComponent],
  templateUrl: './admin-menu-detail.component.html',
  styleUrls: ['../admin-shared.css', './admin-menu-detail.component.css', './admin-menu-forms.css']
})
export class AdminMenuDetailComponent implements OnChanges {

  @Input({ required: true }) menuId!: string;
  @Output() closed = new EventEmitter<boolean>();
  @Output() changed = new EventEmitter<void>();
  @ViewChild('panel') panel?: ElementRef<HTMLElement>;

  private admin = inject(AdminService);
  /** บัญชีผู้ประเมิน: ส่วนที่แก้ได้ทั้งหมดกดไม่ได้ */
  readonly ro = this.admin.readOnly;
  private auth = inject(AuthService);

  readonly stock = STOCK;
  readonly designedBy = DESIGNED_BY;
  readonly aiTools = AI_TOOLS;
  readonly maxName = MAX_NAME;
  readonly maxTags = MAX_TAGS;

  data = signal<MenuDetail | null>(null);
  error = signal<string | null>(null);
  busy = signal<Part | null>(null);
  notice = signal<string | null>(null);
  fieldErrors: Record<string, string> = {};
  private dirty = false;

  // สถานะ
  visibilityReason = '';
  // ชื่อ / tag
  shortName = '';
  tags: string[] = [];
  newTag = '';
  displayReason = '';
  // รูป
  file: File | null = null;
  preview: string | null = null;
  fileNote = '';
  siteChoice = '';
  siteOther = '';
  credit: CreditInput = { site: '', url: '', photographer: '', license: '' };
  imageReason = '';
  // ย้อนกลับ
  revertParts: Record<Part, boolean> = { visibility: false, display: false, image: false };
  revertReason = '';
  confirmRevert = signal(false);

  ngOnChanges(): void {
    this.load();
    setTimeout(() => this.panel?.nativeElement.focus());
  }

  // ---------- โหลด ----------

  private load(): void {
    this.error.set(null);
    this.admin.menu(this.menuId).subscribe({
      next: d => this.fill(d),
      error: (e: HttpErrorResponse) => this.error.set(e.status === 404 ? 'ไม่พบเมนูนี้' : 'โหลดข้อมูลเมนูไม่สำเร็จ')
    });
  }

  private fill(d: MenuDetail): void {
    this.data.set(d);
    this.shortName = d.effective.shortName;
    this.tags = [...d.effective.tags];
    this.newTag = '';
    this.visibilityReason = '';
    this.displayReason = '';
    this.imageReason = '';
    this.revertReason = '';
    this.clearFile();
    this.fillCredit(d.effective.credit);
    this.revertParts = { visibility: false, display: false, image: false };
  }

  private fillCredit(c: ImageCredit | null): void {
    const site = c?.site ?? '';
    const known = [...STOCK, ...AI_TOOLS].find(s => s.toLowerCase() === site.toLowerCase())
      ?? DESIGNED_BY.find(s => site.toLowerCase().startsWith(s.toLowerCase()));
    this.siteChoice = known ?? (site ? 'other' : '');
    this.siteOther = known ? '' : site;
    this.credit = {
      site, url: c?.style === 'designed-by' ? (c.page ?? '') : (c?.url ?? ''),
      photographer: c?.photographer ?? '', license: c?.license ?? ''
    };
  }

  // ---------- สถานะ ----------

  toggleVisibility(): void {
    const d = this.data();
    if (!d) return;
    if (!this.visibilityReason.trim()) {
      this.fieldErrors = { reason: 'กรุณาระบุเหตุผล' };
      return;
    }
    this.run('visibility', this.admin.setMenuVisibility(d.id, d.hidden ? 'show' : 'hide', this.visibilityReason.trim()),
      d.hidden ? 'เปิดเมนูแล้ว' : 'ซ่อนเมนูแล้ว');
  }

  // ---------- ชื่อ / tag ----------

  get nameLength(): number {
    return [...this.shortName.trim()].length;
  }

  /** false = เพิ่มไม่ได้ (ยาวเกิน / ครบจำนวนแล้ว) — คงข้อความในช่องไว้ให้แก้ และแสดงข้อความใต้ช่อง */
  addTag(): boolean {
    const t = this.newTag.replace(/,/g, ' ').trim().replace(/\s+/g, ' ');
    if (!t || this.tags.includes(t)) {
      this.newTag = '';
      return true;
    }
    const rest = { ...this.fieldErrors };
    delete rest['tags'];
    if (t.length > MAX_TAG) {
      this.fieldErrors = { ...rest, tags: `tag ยาวได้ไม่เกิน ${MAX_TAG} ตัวอักษร` };
      return false;
    }
    if (this.tags.length >= MAX_TAGS) {
      this.fieldErrors = { ...rest, tags: `tag ได้ไม่เกิน ${MAX_TAGS} รายการ` };
      return false;
    }
    this.fieldErrors = rest;
    this.tags = [...this.tags, t];
    this.newTag = '';
    return true;
  }

  onTagKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      this.addTag();
    } else if (e.key === 'Backspace' && !this.newTag && this.tags.length) {
      this.tags = this.tags.slice(0, -1);
    }
  }

  removeTag(t: string): void {
    this.tags = this.tags.filter(x => x !== t);
  }

  get displayChanged(): boolean {
    const d = this.data();
    if (!d) return false;
    return this.shortName.trim() !== d.effective.shortName || this.newTag.trim() !== ''
      || JSON.stringify(this.tags) !== JSON.stringify(d.effective.tags);
  }

  saveDisplay(): void {
    const d = this.data();
    if (!d) return;
    const errors: Record<string, string> = {};
    if (!this.addTag()) errors['tags'] = this.fieldErrors['tags'];
    if (this.nameLength > MAX_NAME) errors['shortName'] = `ชื่อสั้นยาวได้ไม่เกิน ${MAX_NAME} ตัวอักษร (ตอนนี้ ${this.nameLength})`;
    if (this.tags.length > MAX_TAGS) errors['tags'] = `tag ได้ไม่เกิน ${MAX_TAGS} รายการ (ตอนนี้ ${this.tags.length})`;
    if (Object.keys(errors).length) {
      this.fieldErrors = errors;
      return;
    }
    const name = this.shortName.trim();
    const sameTags = JSON.stringify(this.tags) === JSON.stringify(d.source.tags);
    this.run('display', this.admin.updateMenuDisplay(d.id, name === d.source.shortName ? null : name,
      sameTags ? null : this.tags, this.displayReason.trim()), 'บันทึกชื่อและ tag แล้ว');
  }

  // ---------- รูป + เครดิต ----------

  get creditKind(): CreditKind {
    const site = this.siteValue.toLowerCase();
    if (!site) return '';
    if (STOCK.some(s => s.toLowerCase() === site)) return 'stock';
    if (DESIGNED_BY.some(s => site.replace(/^www\./, '').replace(/\.com$/, '') === s.toLowerCase())) return 'designed-by';
    if (AI_TOOLS.some(t => site === t.toLowerCase() || site.startsWith(t.toLowerCase() + ' '))) return 'ai';
    return 'web';
  }

  get siteValue(): string {
    return (this.siteChoice === 'other' ? this.siteOther : this.siteChoice).trim();
  }

  get needsName(): boolean {
    const k = this.creditKind;
    return k === 'stock' || k === 'designed-by' || (k === 'web' && /\bBY\b/i.test(this.credit.license.replace(/-/g, ' ')));
  }

  async onFile(input: HTMLInputElement): Promise<void> {
    const picked = input.files?.[0] ?? null;
    this.fieldErrors = {};
    this.fileNote = '';
    if (!picked) return;
    if (!TYPES.includes(picked.type)) {
      this.fieldErrors = { file: 'รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP' };
      input.value = '';
      return;
    }
    const shrunk = await shrinkImage(picked);
    const f = shrunk?.file ?? picked;
    if (f.size > MAX_BYTES) {
      this.fieldErrors = { file: 'ไฟล์ใหญ่เกิน 5MB' };
      input.value = '';
      return;
    }
    this.clearFile();
    this.file = f;
    this.preview = URL.createObjectURL(f);
    if (shrunk) this.fileNote = `ย่อรูปจาก ${shrunk.from} เป็น ${shrunk.to} พิกเซลก่อนอัปโหลด`;
  }

  clearFile(): void {
    if (this.preview) URL.revokeObjectURL(this.preview);
    this.preview = null;
    this.file = null;
    this.fileNote = '';
  }

  saveImage(): void {
    const d = this.data();
    if (!d) return;
    const k = this.creditKind;
    const credit: CreditInput = {
      site: this.siteValue,
      url: k === 'ai' ? '' : this.credit.url.trim(),
      photographer: k === 'ai' ? '' : this.credit.photographer.trim(),
      license: k === 'web' ? this.credit.license.trim() : ''
    };
    this.run('image', this.admin.updateMenuImage(d.id, this.file, credit, this.imageReason.trim()),
      this.file ? 'อัปโหลดรูปแล้ว' : 'บันทึกเครดิตแล้ว');
  }

  // ---------- ย้อนกลับ ----------

  get revertable(): { part: Part; label: string }[] {
    const o = this.data()?.override;
    if (!o) return [];
    const out: { part: Part; label: string }[] = [];
    if (o.visibility) out.push({ part: 'visibility', label: o.visibility === 'HIDDEN' ? 'การซ่อนของแอดมิน' : 'การเปิดทับของแอดมิน' });
    if (o.shortName != null || o.tags != null) out.push({ part: 'display', label: 'ชื่อสั้นและ tag' });
    if (o.imageUrl) out.push({ part: 'image', label: o.imageUploaded ? 'รูป (คืนรูปต้นทางบน Cloudinary) และเครดิต' : 'เครดิตรูป' });
    return out;
  }

  revert(): void {
    const d = this.data();
    const parts = (Object.keys(this.revertParts) as Part[]).filter(p => this.revertParts[p]);
    this.confirmRevert.set(false);
    if (!d || !parts.length) return;
    this.run('visibility', this.admin.revertMenu(d.id, parts, this.revertReason.trim()), 'ย้อนเป็นค่าต้นทางแล้ว');
  }

  // ---------- ทั่วไป ----------

  when(iso: string | null): string {
    return iso ? TH_DT.format(new Date(iso)) : '-';
  }

  json(v: unknown): string {
    return v == null ? '-' : JSON.stringify(v);
  }

  creditText(c: ImageCredit | null): string {
    if (!c?.site) return 'ไม่มีเครดิต';
    if (c.ai) return `ภาพสร้างด้วย AI (${c.site})`;
    if (c.style === 'designed-by') return `designed by ${c.photographer} - ${c.site}`;
    return `ภาพ${c.photographer ? 'โดย ' + c.photographer + ' ' : ''}จาก ${c.site}${c.license ? ' (' + c.license + ')' : ''}`;
  }

  close(): void {
    this.clearFile();
    this.closed.emit(this.dirty);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.confirmRevert()) return;   // Esc ปิด pop-up ยืนยันก่อน
    this.close();
  }

  private run(part: Part, req: ReturnType<AdminService['menu']>, done: string): void {
    this.busy.set(part);
    this.fieldErrors = {};
    this.notice.set(null);
    req.subscribe({
      next: d => {
        this.busy.set(null);
        this.dirty = true;
        this.fill(d);
        this.notice.set(done);
        this.changed.emit();
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(null);
        const f = this.auth.toFormError(e);
        this.fieldErrors = Object.keys(f.fields).length ? f.fields : { general: f.message };
      }
    });
  }
}

/**
 * ย่อรูปที่ด้านยาวเกิน MAX_SIDE เป็น JPEG (หมุนตาม EXIF — imageOrientation 'from-image'; พื้นโปร่งใสเป็นสีขาว).
 * ไม่ต้องย่อ / เบราว์เซอร์ถอดรูปไม่ได้ → null (ส่งไฟล์เดิม ให้ backend ตรวจ)
 */
async function shrinkImage(file: File): Promise<{ file: File; from: string; to: string } | null> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  try {
    const long = Math.max(bmp.width, bmp.height);
    if (long <= MAX_SIDE) return null;
    const scale = MAX_SIDE / long;
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/jpeg', 0.9));
    if (!blob) return null;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return { file: new File([blob], name, { type: 'image/jpeg' }), from: `${bmp.width}×${bmp.height}`, to: `${w}×${h}` };
  } finally {
    bmp.close();
  }
}
