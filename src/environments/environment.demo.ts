/**
 * ค่าตั้งของโหมดเดโม (ng build --configuration demo) — แทน environment.ts ผ่าน fileReplacements ใน angular.json.
 * รูปเมนูในเดโมเป็นไฟล์ placeholder ใน public/images/demo/ จึงไม่โหลดรูปจากเว็บภายนอกเลย
 */
export const environment = {
  demo: true,
  loadExternalMenuImages: false,
  externalMenuImageHosts: ['aroifin.com'],
};
