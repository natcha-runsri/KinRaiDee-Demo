// GitHub Pages ไม่มี SPA fallback: เปิด/รีเฟรช URL ลึก (เช่น /KinRaiDee-Demo/menu/101) จะได้ 404.html
// คัดลอก index.html เป็น 404.html → Pages ส่งแอปเดิมกลับมา แล้ว Angular router แสดงหน้าตาม URL เอง
import { copyFileSync, existsSync } from 'node:fs';

const dir = process.argv[2] ?? 'dist/frontend/browser';
const index = `${dir}/index.html`;
if (!existsSync(index)) {
  console.error(`ไม่พบ ${index} — build ก่อน`);
  process.exit(1);
}
copyFileSync(index, `${dir}/404.html`);
console.log(`copied ${index} -> ${dir}/404.html`);
