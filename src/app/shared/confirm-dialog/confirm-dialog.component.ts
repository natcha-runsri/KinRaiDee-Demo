import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild } from '@angular/core';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Pop-up ยืนยันสั้น ๆ (ออกจากระบบ / ทิ้งการแก้ไข). Esc / backdrop / "ยกเลิก" → cancelled.
 * a11y: role=alertdialog, aria-modal, focus trap, คืน focus ให้ element เดิมตอนปิด.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    <div class="cd-backdrop" (mousedown)="onBackdrop($event)">
      <div #dialog class="cd-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cd-title"
           [attr.aria-describedby]="message ? 'cd-message' : null">
        <p id="cd-title" class="cd-title">{{ title }}</p>
        @if (message) { <p id="cd-message" class="cd-message">{{ message }}</p> }
        <div class="cd-actions">
          <button type="button" class="cd-confirm hit44" [class.danger]="danger" (click)="confirmed.emit()">{{ confirmLabel }}</button>
          <button type="button" class="cd-cancel hit44" (click)="cancelled.emit()">{{ cancelLabel }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cd-backdrop{ position:fixed; inset:0; z-index:1100; display:flex; align-items:center; justify-content:center;
      padding:16px; background:var(--overlay-bg); -webkit-backdrop-filter:var(--overlay-blur); backdrop-filter:var(--overlay-blur); animation:cd-fade .15s ease-out; }
    .cd-dialog{ width:100%; max-width:380px; padding:26px 24px 22px; border-radius:18px; background:#FFFDF7;
      box-shadow:var(--popup-shadow); font-family:'Prompt', sans-serif; text-align:center;
      animation:cd-pop .18s ease-out; }
    .cd-title{ margin:0; font-size:18px; font-weight:700; color:#1F2D4D; }
    .cd-message{ margin:8px 0 0; font-size:13px; color:#6b6b6b; }
    .cd-actions{ display:flex; gap:10px; justify-content:center; margin-top:20px; flex-wrap:wrap; }
    button{ min-width:120px; padding:10px 18px; border-radius:999px; font:inherit; font-weight:600; font-size:14px; cursor:pointer; }
    .cd-confirm{ border:none; background:#1F2D4D; color:#FFEBAC; }
    .cd-confirm.danger{ background:var(--color-primary); }
    .cd-cancel{ border:1.5px solid #1F2D4D; background:transparent; color:#1F2D4D; }
    button:focus-visible{ outline:3px solid #A9C6F0; outline-offset:2px; }
    @keyframes cd-fade{ from{ opacity:0; } }
    @keyframes cd-pop{ from{ opacity:0; transform:scale(.96); } }
    @media (prefers-reduced-motion: reduce){ .cd-backdrop, .cd-dialog{ animation:none; } }
  `]
})
export class ConfirmDialogComponent implements AfterViewInit, OnDestroy {
  @Input() title = '';
  @Input() message = '';
  @Input() confirmLabel = 'ยืนยัน';
  @Input() cancelLabel = 'ยกเลิก';
  @Input() danger = false;
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('dialog') dialogRef!: ElementRef<HTMLElement>;
  private returnFocus: HTMLElement | null = null;

  ngAfterViewInit(): void {
    this.returnFocus = document.activeElement as HTMLElement | null;
    // ปุ่มที่ปลอดภัย (ยกเลิก) ได้ focus ก่อน
    setTimeout(() => this.dialogRef.nativeElement.querySelector<HTMLElement>('.cd-cancel')?.focus());
  }

  ngOnDestroy(): void {
    this.returnFocus?.focus?.();
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancelled.emit();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancelled.emit();
    } else if (event.key === 'Tab') {
      const items = Array.from(this.dialogRef.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
}
