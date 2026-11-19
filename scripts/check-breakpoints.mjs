// ตรวจว่า @media ทุกตัวใน src/ ใช้แค่ breakpoint กลาง (--bp-* ใน src/styles.css): node scripts/check-breakpoints.mjs
// max-width = ค่าใน --bp-* (479.98px …); min-width = ขอบเดียวกันจากอีกด้าน (480px / 768px / 1024px / 1200px)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const tokens = [...readFileSync(join(root, 'styles.css'), 'utf8').matchAll(/--bp-(\w+)\s*:\s*([\d.]+px)/g)];
const allowed = new Set(tokens.map(m => m[2]));
const allowedMin = new Set(tokens.map(m => `${Math.round(parseFloat(m[2]))}px`));   // 767.98px → 768px
if (allowed.size === 0) {
  console.error('ไม่พบ --bp-* ใน src/styles.css');
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(css|scss)$/.test(name) || /\.component\.ts$/.test(name)) files.push(p);   // .ts = styles แบบ inline
  }
})(root);

const errors = [];
let count = 0;
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const media of line.matchAll(/@media[^{]*/g)) {
      for (const m of media[0].matchAll(/(min|max)-width\s*:\s*([\d.]+)(px|em|rem)?/g)) {
        count++;
        const value = m[2] + (m[3] ?? '');
        if (!(m[1] === 'max' ? allowed : allowedMin).has(value)) {
          errors.push(`${relative(root, file)}:${i + 1}  ${m[0]}`);
        }
      }
    }
  });
}

if (errors.length) {
  console.error(`breakpoint นอกชุดกลาง (max-width ${[...allowed].join(', ')} / min-width ${[...allowedMin].join(', ')}):`);
  errors.forEach(e => console.error('  ' + e));
  process.exit(1);
}
console.log(`ok: ${count} breakpoint ใน ${files.length} ไฟล์ ใช้ชุดกลางทั้งหมด`);
