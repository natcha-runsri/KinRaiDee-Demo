import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { ArtImageComponent } from '../../../shared/art-image/art-image.component';
import { AccountService } from '../../../account.service';
import { AuthService } from '../../../auth.service';
import { AnalysisConfig, AnalysisGender, AnalysisService } from '../../../analysis.service';
import { ageError, heightError, weightError } from '../../../profile.validators';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

type Field = 'weightKg' | 'heightCm' | 'age' | 'gender';

/**
 * Pop-up ก่อนวิเคราะห์ 2 ขั้น: (1) ข้อมูลพื้นฐาน ดึงจากโปรไฟล์มาใส่ให้ แก้ได้ ตรวจช่วงเดียวกับหน้าโปรไฟล์
 * (ถ้าต่างจากโปรไฟล์ backend บันทึกกลับเมื่อวิเคราะห์สำเร็จ) (2) แบบสอบถามพฤติกรรม (คำถามจาก config ฝั่ง backend)
 * "เริ่มทำงาน" → POST /api/analyses → started(id). a11y: role=dialog, aria-modal, focus trap, Esc/X ปิด, คืน focus
 */
@Component({
  selector: 'app-analysis-dialog',
  standalone: true,
  imports: [FormsModule, ArtImageComponent],
  templateUrl: './analysis-dialog.component.html',
  // มือถือ (≤ 767px) แยกไฟล์ (budget CSS ต่อไฟล์ 8kB)
  styleUrls: ['./analysis-dialog.component.css', './analysis-dialog-mobile.css']
})
export class AnalysisDialogComponent implements OnInit, AfterViewInit, OnDestroy {

  @Input({ required: true }) config!: AnalysisConfig;
  @Input({ required: true }) date!: string;
  @Output() closed = new EventEmitter<void>();
  @Output() started = new EventEmitter<string>();
  @ViewChild('dialog') dialogRef!: ElementRef<HTMLElement>;

  private accounts = inject(AccountService);
  private analyses = inject(AnalysisService);
  private auth = inject(AuthService);
  private subs = new Subscription();
  private previousFocus: HTMLElement | null = null;
  private previousOverflow = '';

  readonly genders: { value: AnalysisGender; label: string }[] = [
    { value: 'female', label: 'หญิง' }, { value: 'male', label: 'ชาย' }, { value: 'other', label: 'อื่นๆ' }
  ];

  step: 1 | 2 = 1;
  form = { weightKg: '', heightCm: '', age: '', gender: '' as AnalysisGender | '' };
  answers: Record<string, string> = {};
  errors: Partial<Record<Field, string>> = {};
  answersError = '';
  submitError = '';
  submitting = false;

  ngOnInit(): void {
    this.previousFocus = document.activeElement as HTMLElement | null;
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.subs.add(this.accounts.get().subscribe({
      next: a => {
        // ช่องที่ผู้ใช้เริ่มพิมพ์แล้วไม่ทับ
        if (!this.form.weightKg && a.weightKg != null) this.form.weightKg = String(a.weightKg);
        if (!this.form.heightCm && a.heightCm != null) this.form.heightCm = String(a.heightCm);
        if (!this.form.age && a.age != null) this.form.age = String(a.age);
        if (!this.form.gender && a.gender) this.form.gender = a.gender as AnalysisGender;
      }
    }));
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.focusFirst());
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    document.body.style.overflow = this.previousOverflow;
    this.previousFocus?.focus?.();
  }

  close(): void {
    if (!this.submitting) this.closed.emit();
  }

  // ---------- ขั้นที่ 1 ----------

  validateField(f: Field): void {
    const v = String(this.form[f] ?? '');
    const required = !v.trim();
    const msg: Record<Field, () => string | null> = {
      weightKg: () => required ? 'กรุณากรอกน้ำหนัก' : weightError(v),
      heightCm: () => required ? 'กรุณากรอกส่วนสูง' : heightError(v),
      age: () => required ? 'กรุณากรอกอายุ' : ageError(v),
      gender: () => required ? 'กรุณาเลือกเพศ' : null
    };
    const e = msg[f]();
    if (e) this.errors[f] = e; else delete this.errors[f];
  }

  next(): void {
    (['weightKg', 'heightCm', 'age', 'gender'] as Field[]).forEach(f => this.validateField(f));
    const first = (['weightKg', 'heightCm', 'age', 'gender'] as Field[]).find(f => this.errors[f]);
    if (first) {
      this.focusField(first);
      return;
    }
    this.step = 2;
    setTimeout(() => this.focusFirst());
  }

  back(): void {
    this.step = 1;
    this.submitError = '';
    setTimeout(() => this.focusFirst());
  }

  pickGender(g: AnalysisGender): void {
    this.form.gender = g;
    delete this.errors.gender;
  }

  // ---------- ขั้นที่ 2 ----------

  get unanswered(): number {
    return this.config.questions.filter(q => !this.answers[q.key]).length;
  }

  submit(): void {
    if (this.submitting) return;
    if (this.unanswered) {
      this.answersError = `กรุณาตอบให้ครบทุกข้อ (เหลืออีก ${this.unanswered} ข้อ)`;
      const q = this.config.questions.find(x => !this.answers[x.key]);
      if (q) this.dialogRef.nativeElement.querySelector<HTMLElement>(`input[name="q-${q.key}"]`)?.focus();
      return;
    }
    this.answersError = '';
    this.submitError = '';
    this.submitting = true;
    this.subs.add(this.analyses.create({
      date: this.date,
      weightKg: Number(this.form.weightKg.trim()),
      heightCm: Number(this.form.heightCm.trim()),
      age: Number(this.form.age.trim()),
      gender: this.form.gender as AnalysisGender,
      answers: { ...this.answers }
    }).subscribe({
      next: res => { this.submitting = false; this.started.emit(res.id); },
      error: (err: HttpErrorResponse) => {
        this.submitting = false;
        const e = this.auth.toFormError(err);
        const stepOne = (['weightKg', 'heightCm', 'age', 'gender'] as Field[]).filter(f => e.fields[f]);
        if (stepOne.length) {
          stepOne.forEach(f => this.errors[f] = e.fields[f]);
          this.step = 1;
          setTimeout(() => this.focusField(stepOne[0]));
          return;
        }
        this.submitError = e.fields['date'] || Object.values(e.fields)[0] || e.message || 'เริ่มวิเคราะห์ไม่สำเร็จ กรุณาลองใหม่';
      }
    }));
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

  private focusFirst(): void {
    const d = this.dialogRef?.nativeElement;
    d?.querySelector<HTMLElement>(this.step === 1 ? '#ad-weight' : 'input[type=radio]')?.focus();
  }

  private focusField(f: Field): void {
    const id = { weightKg: '#ad-weight', heightCm: '#ad-height', age: '#ad-age', gender: '.gender-btn' }[f];
    this.dialogRef.nativeElement.querySelector<HTMLElement>(id)?.focus();
  }
}
