import { Component, HostListener, OnDestroy, OnInit, effect } from '@angular/core';
import { BmiBadgeComponent } from '../../../shared/bmi-badge/bmi-badge.component';
import { BmiResult, computeBmi } from '../../../bmi';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Account, AccountService, Gender, ProfileFields } from '../../../account.service';
import { AuthService } from '../../../auth.service';
import { LeaveGuarded } from '../../../auth.guard';
import { usernameError } from '../../../auth.validators';
import { ageError, heightError, toNumberOrNull, weightError } from '../../../profile.validators';
import { ProfileStateService } from '../profile-state.service';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import { ChangePasswordDialogComponent } from './change-password-dialog.component';
import { ChangeEmailDialogComponent } from './change-email-dialog.component';
import { AllergyFieldComponent } from './allergy-field.component';
import { AllergyValue, NO_ALLERGIES, sameAllergies } from '../../../allergy.service';

type Field = 'username' | 'age' | 'gender' | 'weightKg' | 'heightCm';

interface PersonalForm {
  username: string;
  age: string;
  gender: Gender | '';
  weightKg: string;
  heightCm: string;
}

const TOAST_MS = 3500;

/**
 * หน้า "บัญชีของฉัน": ดูข้อมูล / แก้ข้อมูลส่วนตัว / เปลี่ยน-เพิ่มอีเมล (pop-up ยืนยันรหัสผ่าน + OTP ที่อีเมลใหม่)
 * / เปลี่ยนรหัสผ่าน (pop-up OTP ทางอีเมล).
 * ปุ่มมุมขวาของข้อมูลส่วนตัว: ยังไม่แก้ = "ยกเลิก", แก้แล้ว = "บันทึก..." (error = กดไม่ได้), แก้กลับเหมือนเดิม = "ยกเลิก".
 * Esc / ออกจากหน้าตอนมีการแก้ค้าง → ถามทิ้งการแก้ไข. backend ตัดสินสุดท้ายทุกช่อง (error รายช่องจาก API).
 */
@Component({
  selector: 'app-account',
  standalone: true,
  imports: [AllergyFieldComponent, FormsModule, NgTemplateOutlet, ConfirmDialogComponent, ChangePasswordDialogComponent, ChangeEmailDialogComponent,
    BmiBadgeComponent],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.css', './account-edit.css', './account-bmi.css']
})
export class AccountComponent implements OnInit, OnDestroy, LeaveGuarded {

  readonly usernameMax = 20;

  loadError = '';
  editing = false;
  form: PersonalForm = this.toForm(null);
  /** อาหารที่แพ้ (แยกจากช่องข้อความ — ป้ายกดเลือก/เพิ่มเอง) */
  allergyForm: AllergyValue = NO_ALLERGIES;
  private allergyOriginal: AllergyValue = NO_ALLERGIES;
  private original: PersonalForm = this.toForm(null);
  private touched = new Set<Field>();
  serverErrors: Partial<Record<Field, string>> = {};
  formError = '';
  saving = false;

  /** pop-up เปลี่ยนรหัสผ่าน (OTP) */
  pwDialogOpen = false;
  /** บัญชียังไม่มีอีเมล → แสดงข้อความชวนเพิ่มอีเมลแทนการเปิด pop-up */
  pwNeedsEmail = false;

  /** pop-up เปลี่ยน/เพิ่มอีเมล (แยกจากการบันทึกข้อมูลส่วนตัว) */
  emailDialogOpen = false;
  /** ปุ่มที่เปิด pop-up อีเมล — คืน focus ตอนปิด */
  private emailTrigger: HTMLElement | null = null;

  discardOpen = false;
  private discardResolve: ((ok: boolean) => void) | null = null;

  toast = '';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private accounts: AccountService,
    private auth: AuthService,
    readonly state: ProfileStateService
  ) {
    // layout โหลดบัญชีให้ — เมื่อได้ข้อมูล (หรือรูปเปลี่ยน) และไม่ได้แก้อยู่ ให้ฟอร์มตรงกับข้อมูลล่าสุด
    effect(() => {
      const acc = this.state.account();
      if (acc && !this.editing) {
        this.original = this.toForm(acc);
        this.form = { ...this.original };
        this.resetAllergies(acc);
      }
    });
  }

  ngOnInit(): void {
    this.state.setDiscardPrompt(() => this.dirtyAnywhere ? this.askDiscard() : Promise.resolve(true));
  }

  ngOnDestroy(): void {
    this.state.setDiscardPrompt(null);
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  get account(): Account | null {
    return this.state.account();
  }

  /** โหมดแก้ไข: BMI จากค่าที่กำลังพิมพ์ (อัปเดตทันที) — ช่องว่าง/ผิดรูปแบบ/นอกช่วงที่บันทึกได้ → null ("-") */
  get liveBmi(): BmiResult | null {
    if (weightError(this.form.weightKg) || heightError(this.form.heightCm)) return null;
    return computeBmi(this.form.weightKg, this.form.heightCm, this.account?.bmiScale);
  }

  // ---------- โหมดดูข้อมูล ----------

  genderLabel(g: Gender | null | undefined): string {
    return g === 'male' ? 'ผู้ชาย' : g === 'female' ? 'ผู้หญิง' : g === 'other' ? 'อื่นๆ' : '';
  }

  // ---------- ข้อมูลส่วนตัว: สถานะ ----------

  /** เทียบหลัง trim (อีเมลไม่สนตัวพิมพ์, ตัวเลขเทียบค่า 60 = 60.0) */
  private same(field: Field): boolean {
    const a = this.form[field].trim();
    const b = this.original[field].trim();
    if ((field === 'weightKg' || field === 'heightCm' || field === 'age') && a !== '' && b !== ''
        && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) {
      return Number(a) === Number(b);
    }
    return a === b;
  }

  private readonly fields: Field[] = ['username', 'age', 'gender', 'weightKg', 'heightCm'];

  get dirty(): boolean {
    return this.editing && (this.fields.some(f => !this.same(f)) || !sameAllergies(this.allergyForm, this.allergyOriginal));
  }

  /** error ปัจจุบันของทุกช่อง (ใช้ตัดสินปุ่มบันทึก) */
  get errors(): Partial<Record<Field, string>> {
    const out: Partial<Record<Field, string>> = {};
    const check: Record<Field, string | null> = {
      username: usernameError(this.form.username),
      age: ageError(this.form.age),
      gender: null,
      weightKg: weightError(this.form.weightKg),
      heightCm: heightError(this.form.heightCm)
    };
    for (const f of this.fields) {
      const msg = check[f] ?? this.serverErrors[f];
      if (msg) out[f] = msg;
    }
    return out;
  }

  get hasErrors(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  /** แสดง error ใต้ช่องเมื่อช่องนั้นถูกแก้/ออกจากช่องแล้ว หรือเป็น error จาก server */
  shownError(field: Field): string | null {
    if (this.serverErrors[field]) return this.serverErrors[field]!;
    return this.touched.has(field) || !this.same(field) ? this.errors[field] ?? null : null;
  }

  onFieldChange(field: Field): void {
    delete this.serverErrors[field];
    this.formError = '';
  }

  onBlur(field: Field): void {
    this.touched.add(field);
  }

  // ---------- ข้อมูลส่วนตัว: การกระทำ ----------

  startEdit(): void {
    if (!this.account) return;
    this.pwNeedsEmail = false;
    this.original = this.toForm(this.account);
    this.form = { ...this.original };
    this.resetAllergies(this.account);
    this.touched.clear();
    this.serverErrors = {};
    this.formError = '';
    this.editing = true;
    setTimeout(() => document.getElementById('pf-username')?.focus());
  }

  /** ตัวเลือกเพศในโหมดแก้ไข — '' = ไม่ระบุ */
  readonly genderOptions: { value: Gender | ''; label: string }[] = [
    { value: 'female', label: 'หญิง' }, { value: 'male', label: 'ชาย' }, { value: 'other', label: 'อื่นๆ' }, { value: '', label: 'ไม่ระบุ' }
  ];

  /** [ส่วนหน้า @, "@โดเมน"] — ให้ตัดบรรทัดหลัง @ */
  emailParts(email: string): [string, string] {
    const at = email.indexOf('@');
    return at < 0 ? [email, ''] : [email.slice(0, at), email.slice(at)];
  }

  setGender(g: Gender | ''): void {
    this.form.gender = g;
    this.onFieldChange('gender');
  }

  /** "ยกเลิก" ท้ายฟอร์ม: แก้ค้าง → ถามทิ้งก่อน (เหมือน Esc) */
  async cancelEdit(): Promise<void> {
    if (this.saving) return;
    if (this.dirty && !(await this.askDiscard())) return;
    this.exitEdit();
  }

  /** "บันทึก" ท้ายฟอร์ม (และ Enter) — ยังไม่แก้ / มี error / กำลังบันทึก → ไม่ทำอะไร */
  save(): void {
    if (!this.dirty || this.hasErrors || this.saving) return;
    this.saving = true;
    this.accounts.updateProfile(this.profileFields()).subscribe({
      next: acc => this.saved(acc),
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.applyErrors(err);
      }
    });
  }

  private exitEdit(): void {
    this.editing = false;
    this.serverErrors = {};
    this.formError = '';
    this.form = { ...this.original };
    this.allergyForm = this.allergyOriginal;
  }

  private profileFields(): ProfileFields {
    return {
      username: this.form.username.trim(),
      age: toNumberOrNull(this.form.age),
      gender: this.form.gender || null,
      weightKg: toNumberOrNull(this.form.weightKg),
      heightCm: toNumberOrNull(this.form.heightCm),
      allergies: { keys: [...this.allergyForm.keys], custom: [...this.allergyForm.custom] }
    };
  }

  private saved(acc: Account): void {
    this.saving = false;
    this.editing = false;
    this.state.account.set(acc);
    this.original = this.toForm(acc);
    this.form = { ...this.original };
    this.resetAllergies(acc);
    this.auth.updateUser({ username: acc.username, email: acc.email, displayName: acc.displayName, avatarUrl: acc.avatarUrl });
    this.showToast('บันทึกข้อมูลแล้ว');
  }

  /** 400/409 จาก API → error รายช่อง */
  private applyErrors(err: HttpErrorResponse): void {
    const e = this.auth.toFormError(err);
    const mapped: Partial<Record<Field, string>> = {};
    for (const [key, msg] of Object.entries(e.fields)) {
      const f = key.replace(/^profile\./, '') as Field;
      if (this.fields.includes(f)) mapped[f] = msg;
    }
    this.serverErrors = mapped;
    this.formError = Object.keys(mapped).length ? ''
      : (e.fields['allergies'] || e.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }

  // ---------- เปลี่ยน / เพิ่มอีเมล (pop-up: รหัสผ่าน → อีเมลใหม่ → OTP) ----------

  /** แยกจากโหมดแก้ไข: ข้อมูลส่วนตัวที่แก้ค้างอยู่ไม่ถูกบันทึกหรือล้าง */
  openEmailDialog(event?: Event): void {
    if (!this.account || this.emailDialogOpen) return;
    this.emailTrigger = (event?.currentTarget as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
    this.pwNeedsEmail = false;
    this.emailDialogOpen = true;
  }

  /** เปลี่ยนสำเร็จ (pop-up ยังอยู่ขั้นเสร็จสิ้น) → อีเมลในหน้า/navbar เปลี่ยนทันที, ฟอร์มที่แก้ค้างไม่ถูกแตะ */
  onEmailChanged(acc: Account): void {
    this.state.account.set(acc);
    this.auth.updateUser({ email: acc.email });
  }

  onEmailDialogClosed(): void {
    this.emailDialogOpen = false;
    const trigger = this.emailTrigger;
    // ปุ่มเดิมอาจหายไป (เช่น "เพิ่มอีเมล" → มีอีเมลแล้ว) → focus ปุ่มอีเมลที่มีอยู่ตอนนี้
    setTimeout(() => (trigger?.isConnected ? trigger : document.querySelector<HTMLElement>('.email-action'))?.focus());
  }

  // ---------- เปลี่ยนรหัสผ่าน (pop-up OTP ทางอีเมล) ----------

  /** "แก้ไข" ของส่วนเปลี่ยนรหัสผ่าน: มีการแก้ข้อมูลส่วนตัวค้าง → ถามทิ้งก่อน; ไม่มีอีเมล → ชวนเพิ่มอีเมล */
  async openPasswordDialog(): Promise<void> {
    if (!this.account || this.pwDialogOpen) return;
    if (this.dirty && !(await this.askDiscard())) return;
    if (this.editing) this.exitEdit();
    if (!this.account.email) {
      this.pwNeedsEmail = true;
      return;
    }
    this.pwNeedsEmail = false;
    this.pwDialogOpen = true;
  }

  onPasswordDialogClosed(result: { success: boolean }): void {
    this.pwDialogOpen = false;
    setTimeout(() => document.getElementById('pw-edit-btn')?.focus()); // คืน focus ให้ปุ่ม "แก้ไข"
    if (result.success) {
      this.showToast('เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นจะต้องเข้าสู่ระบบใหม่');
    }
  }

  /** ปุ่มในข้อความ "กรุณาเพิ่มอีเมล..." → เปิด pop-up เพิ่มอีเมล */
  addEmailFirst(event: Event): void {
    this.openEmailDialog(event);
  }

  // ---------- ทิ้งการแก้ไข / ออกจากหน้า ----------

  get dirtyAnywhere(): boolean {
    return this.dirty;
  }

  canLeave(): boolean | Promise<boolean> {
    return this.dirtyAnywhere ? this.askDiscard() : true;
  }

  /** เปิด pop-up "ทิ้งการแก้ไข?" — ยืนยันแล้วล้างโหมดแก้ไขทั้งหมด */
  askDiscard(): Promise<boolean> {
    if (this.discardResolve) return Promise.resolve(false);
    this.discardOpen = true;
    return new Promise(resolve => (this.discardResolve = resolve));
  }

  onDiscardConfirmed(): void {
    this.exitEdit();
    this.finishDiscard(true);
  }

  onDiscardCancelled(): void {
    this.finishDiscard(false);
  }

  private finishDiscard(ok: boolean): void {
    this.discardOpen = false;
    const resolve = this.discardResolve;
    this.discardResolve = null;
    resolve?.(ok);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.editing) return;
    // pop-up ใดเปิดอยู่ ให้ pop-up นั้นจัดการ Esc เอง
    // dropdown ผู้ใช้ใน navbar เปิดอยู่ → Esc แค่ปิดเมนู
    if (this.emailDialogOpen || this.discardOpen || this.pwDialogOpen
        || document.querySelector('[aria-modal="true"], #user-menu')) return;
    if (this.dirtyAnywhere) {
      void this.askDiscard();
    } else {
      this.exitEdit();
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirtyAnywhere) event.preventDefault();
  }

  // ---------- helpers ----------

  private resetAllergies(acc: Account | null): void {
    const a = acc?.allergies;
    this.allergyOriginal = { keys: [...(a?.keys ?? [])], custom: [...(a?.custom ?? [])] };
    this.allergyForm = this.allergyOriginal;
  }

  private toForm(acc: Account | null): PersonalForm {
    const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
    return {
      username: acc?.username ?? '',
      age: num(acc?.age),
      gender: acc?.gender ?? '',
      weightKg: num(acc?.weightKg),
      heightCm: num(acc?.heightCm)
    };
  }

  private showToast(message: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = message;
    this.toastTimer = setTimeout(() => (this.toast = ''), TOAST_MS);
  }
}
