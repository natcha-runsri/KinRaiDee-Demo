// @ts-check
// lint ของ frontend (npm run lint) — CI fail เฉพาะ error; warning ผ่านได้ (ใช้ดูแนวโน้ม)
// ชุดกฎตั้งต้นของ angular-eslint + typescript-eslint; กฎที่โค้ดเดิมยังไม่ผ่านถูกลดเป็น warn (ดูท้ายไฟล์) — แก้โค้ดแล้วค่อยยกกลับเป็น error
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

module.exports = tseslint.config(
  {
    ignores: ["dist/**", ".angular/**", "node_modules/**", "coverage/**", "images_originals/**"],
  },
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/directive-selector": ["error", { type: "attribute", prefix: "app", style: "camelCase" }],
      "@angular-eslint/component-selector": ["error", { type: "element", prefix: "app", style: "kebab-case" }],
      // โค้ดเดิม (2026-10-23): no-unused-expressions 9, no-unused-vars 4 — warn ไว้ก่อน
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  {
    files: ["**/*.html"],
    extends: [...angular.configs.templateRecommended],
    rules: {
      // โค้ดเดิม (2026-10-23): == / != ใน template 30 จุด — warn ไว้ก่อน
      "@angular-eslint/template/eqeqeq": "warn",
    },
  },
);
