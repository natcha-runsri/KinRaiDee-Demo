import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, Subscription, catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { MenuImageComponent } from '../../../shared/menu-image/menu-image.component';
import { AuthService } from '../../../auth.service';
import { AnalysisService, GROUP_CLASS, GroupInfo, MenuSearchItem, ReviewView } from '../../../analysis.service';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

/**
 * Pop-up "เพิ่มเมนูที่กิน" (หน้าตรวจสอบเมนู): ค้นหาชื่อเมนู (อย่างน้อย 2 ตัวอักษร, หน่วง 300ms, ไม่เกิน 20 รายการ —
 * backend ตัดเมนูในรายการซ่อน/ที่มีอาหารที่แพ้) → เลือกเมนู + มื้อ (ค่าเริ่มต้น = มื้อตามเวลาตอนนี้) → "เพิ่ม"
 * → POST /api/analyses/review/meals → added(รายการของวันนั้นหลังเพิ่ม).
 * a11y: role=dialog, aria-modal, focus trap, Esc/X ปิด, คืน focus; มือถือเกือบเต็มจอ
 */
@Component({
  selector: 'app-add-meal-dialog',
  standalone: true,
  imports: [FormsModule, MenuImageComponent],
  templateUrl: './add-meal-dialog.component.html',
  styleUrls: ['../analysis-shared.css', './add-meal-dialog.component.css']
})
export class AddMealDialogComponent implements OnInit, AfterViewInit, OnDestroy {

  @Input({ required: true }) date!: string;
  @Input({ required: true }) slots!: { key: string; label: string }[];
  @Input({ required: true }) defaultSlot!: string;
  @Input({ required: true }) foodGroups!: GroupInfo[];
  /** "วันนี้" / "วันที่ …" */
  @Input() dayWord = 'วันนี้';
  /** เพิ่มเองได้อีกกี่รายการในวันนั้น */
  @Input() remaining = 10;
  @Output() closed = new EventEmitter<void>();
  @Output() added = new EventEmitter<{ review: ReviewView; name: string }>();
  @ViewChild('dialog') dialogRef!: ElementRef<HTMLElement>;

  private analyses = inject(AnalysisService);
  private auth = inject(AuthService);
  private subs = new Subscription();
  private queries = new Subject<string>();
  private previousFocus: HTMLElement | null = null;
  private previousOverflow = '';

  readonly groupClass = GROUP_CLASS;
  query = '';
  slot = '';
  results: MenuSearchItem[] | null = null;
  searching = false;
  searchError = false;
  selected: MenuSearchItem | null = null;
  submitting = false;
  submitError = '';

  ngOnInit(): void {
    this.previousFocus = document.activeElement as HTMLElement | null;
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.slot = this.defaultSlot;
    this.subs.add(this.queries.pipe(
      map(q => q.trim()),
      distinctUntilChanged(),
      tap(q => { this.searching = chars(q) >= MIN_CHARS; this.searchError = false; if (chars(q) < MIN_CHARS) this.results = null; }),
      debounceTime(DEBOUNCE_MS),
      switchMap(q => chars(q) < MIN_CHARS ? of(null) : this.analyses.searchMenus(q).pipe(
        catchError(() => { this.searchError = true; return of([] as MenuSearchItem[]); })))
    ).subscribe(list => {
      this.searching = false;
      this.results = list;
      if (this.selected && !list?.some(r => r.id === this.selected!.id)) this.selected = null;
    }));
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.dialogRef.nativeElement.querySelector<HTMLElement>('#am-search')?.focus());
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    document.body.style.overflow = this.previousOverflow;
    this.previousFocus?.focus?.();
  }

  get tooShort(): boolean {
    return chars(this.query.trim()) < MIN_CHARS;
  }

  onQuery(value: string): void {
    this.query = value;
    this.queries.next(value);
  }

  pick(item: MenuSearchItem): void {
    this.selected = item;
    this.submitError = '';
  }

  label(key: string): string {
    return this.foodGroups.find(g => g.key === key)?.label ?? key;
  }

  submit(): void {
    if (!this.selected || this.submitting) return;
    if (this.remaining <= 0) {
      this.submitError = 'เพิ่มเมนูเองครบจำนวนของวันนี้แล้ว';
      return;
    }
    const name = this.selected.name;
    this.submitting = true;
    this.submitError = '';
    this.subs.add(this.analyses.addMeal(this.date, this.selected.id, this.slot).subscribe({
      next: review => { this.submitting = false; this.added.emit({ review, name }); },
      error: (err: HttpErrorResponse) => {
        this.submitting = false;
        const e = this.auth.toFormError(err);
        this.submitError = e.fields['mealSlot'] || e.fields['recipeId'] || e.fields['date'] || Object.values(e.fields)[0]
          || e.message || 'เพิ่มเมนูไม่สำเร็จ กรุณาลองใหม่';
      }
    }));
  }

  close(): void {
    if (!this.submitting) this.closed.emit();
  }

  // ---------- a11y ----------

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.key === 'Tab') {
      const items = this.focusables();
      if (!items.length) return;
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && this.dialogRef.nativeElement.contains(active);
      if (event.shiftKey && (active === items[0] || !inside)) {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (!event.shiftKey && (active === items[items.length - 1] || !inside)) {
        event.preventDefault();
        items[0].focus();
      }
    }
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  private focusables(): HTMLElement[] {
    const d = this.dialogRef?.nativeElement;
    return d ? Array.from(d.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null) : [];
  }
}

/** จำนวนตัวอักษร (code point) — สระ/วรรณยุกต์ไทยนับเป็นตัวอักษร เหมือนฝั่ง backend */
function chars(s: string): number {
  return Array.from(s).length;
}
