/**
 * แถบ "โหมดเดโม" ติดขอบล่างของจอทุกหน้า (สร้างด้วย DOM ตรง ๆ นอก component ของแอป → ไม่ต้องแก้หน้าใด ๆ).
 * body เว้นที่ด้านล่างเท่าความสูงแถบ และช่องพิมพ์ของแชต AI (sticky ด้านล่าง) ถูกยกขึ้นไม่ให้ซ้อนกัน.
 * pop-up ของแอป (z-index ≥ 1000) อยู่เหนือแถบนี้
 */
const STYLE = `
.demo-bar{position:fixed;left:0;right:0;bottom:0;z-index:950;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;
  gap:6px 12px;padding:6px 16px calc(6px + env(safe-area-inset-bottom,0px));background:#2B2118;color:#FFF5DE;
  font:500 13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 -2px 8px rgba(0,0,0,.18);box-sizing:border-box}
.demo-bar strong{color:#FFD27A;font-weight:700;letter-spacing:.02em}
.demo-bar .demo-actions{display:flex;flex-wrap:wrap;gap:6px}
.demo-bar button{font:inherit;cursor:pointer;border:1px solid #FFD27A;background:transparent;color:#FFD27A;border-radius:999px;padding:3px 12px;min-height:28px}
.demo-bar button:hover,.demo-bar button:focus-visible{background:#FFD27A;color:#2B2118;outline:none}
body{padding-bottom:var(--demo-bar-h,40px)}
.composer{bottom:calc(12px + var(--demo-bar-h,40px) + env(safe-area-inset-bottom,0px) + var(--kb,0px)) !important}
`;

export function showDemoBanner(onLogin: (role: 'user' | 'admin') => void): void {
  if (typeof document === 'undefined' || document.querySelector('.demo-bar')) return;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.className = 'demo-bar';
  bar.setAttribute('role', 'note');
  bar.innerHTML = `<span><strong>โหมดเดโม</strong> ข้อมูลทั้งหมดเป็นข้อมูลจำลอง ไม่มี backend จริง · เข้าสู่ระบบด้วยชื่อและรหัสอะไรก็ได้</span>
    <span class="demo-actions">
      <button type="button" data-role="user">ลองเป็นผู้ใช้ทั่วไป</button>
      <button type="button" data-role="admin">ลองเป็นแอดมิน</button>
    </span>`;
  bar.querySelectorAll<HTMLButtonElement>('button[data-role]').forEach(b =>
    b.addEventListener('click', () => onLogin(b.dataset['role'] === 'admin' ? 'admin' : 'user')));
  document.body.appendChild(bar);

  const sync = () => document.documentElement.style.setProperty('--demo-bar-h', `${bar.offsetHeight}px`);
  sync();
  if ('ResizeObserver' in window) new ResizeObserver(sync).observe(bar);
}
