import { Injectable, signal } from '@angular/core';
import { Account } from '../../account.service';

/**
 * สถานะร่วมระหว่าง layout หน้าโปรไฟล์ (sidebar) กับหน้าย่อย: ข้อมูลบัญชีที่โหลดแล้ว
 * และ "มีการแก้ไขค้างไหม" (sidebar ต้องถามทิ้งการแก้ไขก่อนออกจากระบบ).
 */
@Injectable({ providedIn: 'root' })
export class ProfileStateService {

  readonly account = signal<Account | null>(null);

  /** หน้าย่อยที่มีการแก้ไขค้างลงทะเบียนตัวถามยืนยันไว้ที่นี่ (null = ไม่มีอะไรค้าง) */
  private discardPrompt: (() => Promise<boolean>) | null = null;

  setDiscardPrompt(prompt: (() => Promise<boolean>) | null): void {
    this.discardPrompt = prompt;
  }

  /** true = ไม่มีอะไรค้าง หรือผู้ใช้ยืนยันทิ้งการแก้ไขแล้ว */
  confirmDiscardIfDirty(): Promise<boolean> {
    return this.discardPrompt ? this.discardPrompt() : Promise.resolve(true);
  }
}
