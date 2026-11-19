/**
 * ค่าตั้งของ frontend (ใช้ทั้ง ng serve และ ng build — ยังไม่มีไฟล์แยกต่อ configuration).
 */
export const environment = {
  /**
   * โหลดรูปเมนูจากเว็บต้นทางภายนอก (externalMenuImageHosts) หรือไม่.
   * false = ไม่ขอรูปจากโดเมนเหล่านี้เลย → app-menu-image แสดงภาพสำรองทันที
   * (2026-10-10: aroifin.com บล็อก IP เครื่องนี้ด้วย SG-Captcha — ดู docs/AGENTS.md กติกาข้อ 9).
   * รูปจากโดเมนอื่น (เช่น Cloudinary) โหลดตามปกติไม่ว่าค่านี้เป็นอะไร. เปิดกลับเมื่อย้ายรูปหรือเว็บปลดบล็อกแล้ว
   */
  loadExternalMenuImages: false,
  /** โดเมนต้นทางรูปเมนูที่สวิตช์ข้างบนคุม (รวม subdomain) */
  externalMenuImageHosts: ['aroifin.com'],
};
