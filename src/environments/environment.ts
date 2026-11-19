/**
 * ค่าตั้งของ frontend โหมดปกติ (ng serve / ng build) — ใช้คู่กับ backend จริง.
 * build แบบ --configuration demo แทนไฟล์นี้ด้วย environment.demo.ts
 */
export const environment = {
  /** true = โหมดเดโม (API จำลองในเบราว์เซอร์ ไม่มี backend) */
  demo: false,
  /**
   * โหลดรูปเมนูจากเว็บต้นทางภายนอก (externalMenuImageHosts) หรือไม่.
   * false = ไม่ขอรูปจากโดเมนเหล่านี้เลย → app-menu-image แสดงภาพสำรองทันที.
   * รูปจากโดเมนอื่นโหลดตามปกติไม่ว่าค่านี้เป็นอะไร
   */
  loadExternalMenuImages: false,
  /** โดเมนต้นทางรูปเมนูที่สวิตช์ข้างบนคุม (รวม subdomain) */
  externalMenuImageHosts: ['aroifin.com'],
};
