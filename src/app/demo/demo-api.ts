/**
 * API จำลองของโหมดเดโม — ตอบทุก endpoint /api/** ที่หน้าเว็บเรียก โดยไม่มี backend.
 * สถานะทั้งหมดเก็บในหน่วยความจำของแท็บ (รีเฟรชหน้า = เริ่มใหม่ ยกเว้น session login ที่ AuthService เก็บใน storage).
 * ตัวเลขและข้อความทั้งหมดเป็นข้อมูลจำลอง ไม่ได้คำนวณด้วยกฎหรือ LLM ของระบบจริง
 */
import { HttpRequest } from '@angular/common/http';
import { Account } from '../account.service';
import {
  AdminMe, AdminNotification, AdminUserPage, AdminUserRow, AnalysisOverview, AppSetting, AuditEntry, AuditPage, DataStatus,
  MenuDetail, MenuPage, MenuRow, Metric, Overview, OverviewCard, SettingsView, Slice
} from '../admin.service';
import { AiChatConfig, AiChatResponse, AiRecipe } from '../ai-recommend.service';
import { AllergenOptions, AllergyValue } from '../allergy.service';
import {
  AnalysisConfig, AnalysisResult, AnalysisState, AnalysisStatus, CreateAnalysis, FoodGroupKey, GroupMark, LatestSummary,
  LevelInfo, MenuSearchItem, ReviewItem, ReviewView, ScoreInfo
} from '../analysis.service';
import { AuthUser, TokenResponse, UserRole } from '../auth.service';
import { DashboardView, TrendDays, TrendsView } from '../dashboard.service';
import { FoodPreferenceKey } from '../food-preference.service';
import { AnalysisEntry, HistoryRange, HistorySummary, LikedRecipe, Page } from '../history.service';
import { BannerItem, LatestSpin, RecipeCard, RecipeChip, SpinQuota, SpinResult } from '../random-spin.service';
import { RecipeDetailView } from '../recipe.service';
import {
  AI_CHIPS, AI_KEYWORDS, ANALYSIS_QUESTIONS, DEMO_ALLERGENS, DEMO_RECIPES, DEMO_TEXT, DemoRecipe, GROUP_KEYS, GROUP_LABELS,
  MEAL_SLOTS
} from './demo-data';

export interface DemoReply { status: number; body: unknown; }

type Body = Record<string, unknown>;

const ok = (body: unknown): DemoReply => ({ status: 200, body });
const noContent = (): DemoReply => ({ status: 204, body: null });
const fail = (status: number, message: string, extra: Body = {}): DemoReply =>
  ({ status, body: { error: extra['error'] ?? 'DEMO_ERROR', message, ...extra } });

// ---------------------------------------------------------------- เวลา (เวลาไทย)

const DAY_MS = 86_400_000;
const TH_OFFSET = 7 * 3_600_000;
const thaiDate = (ms: number) => new Date(ms + TH_OFFSET).toISOString().slice(0, 10);
const today = () => thaiDate(Date.now());
const shift = (iso: string, days: number) => thaiDate(Date.parse(iso + 'T12:00:00+07:00') + days * DAY_MS);
const thaiHour = (ms: number) => new Date(ms + TH_OFFSET).getUTCHours();
const nextMidnightIso = () => new Date(Date.parse(shift(today(), 1) + 'T00:00:00+07:00')).toISOString();
const slotOfHour = (h: number) => (h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'late');
const slotLabel = (key: string) => MEAL_SLOTS.find(s => s.key === key)?.label ?? key;
const datesBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = shift(d, 1)) out.push(d);
  return out;
};

// ---------------------------------------------------------------- ผู้ใช้และ token

interface DemoUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  age: number | null;
  gender: 'male' | 'female' | 'other' | null;
  weightKg: number | null;
  heightCm: number | null;
  avatarUrl: string | null;
  allergies: AllergyValue;
  prefs: FoodPreferenceKey[] | null;
  createdAt: string;
  suspendedAt: string | null;
}

const users = new Map<string, DemoUser>();
let userSeq = 1;

function roleFromName(username: string): UserRole {
  const u = username.toLowerCase();
  return u.includes('admin') ? 'ADMIN' : u.includes('reviewer') ? 'REVIEWER' : 'USER';
}

function userByName(username: string, email?: string): DemoUser {
  const key = username.trim().toLowerCase();
  let u = users.get(key);
  if (!u) {
    const isDemo = key === 'demo_user' || key === 'demo_admin';
    u = {
      id: `demo-u${userSeq++}`, username: username.trim(), email: email ?? `${key}@example.com`,
      displayName: null, role: roleFromName(key),
      age: isDemo ? 24 : null, gender: isDemo ? 'female' : null, weightKg: isDemo ? 55 : null, heightCm: isDemo ? 162 : null,
      avatarUrl: null, allergies: { keys: [], custom: [] }, prefs: isDemo ? ['spicy', 'stir_fry'] : null,
      createdAt: new Date(Date.now() - 20 * DAY_MS).toISOString(), suspendedAt: null
    };
    users.set(key, u);
    seedUserActivity(u);
  }
  return u;
}

const enc = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/=+$/, '');
const dec = (s: string) => decodeURIComponent(escape(atob(s)));

function tokensFor(u: DemoUser): TokenResponse {
  return {
    accessToken: `demo-access.${enc(u.username)}`,
    refreshToken: `demo-refresh.${enc(u.username)}`,
    tokenType: 'Bearer',
    expiresIn: 3600,
    user: authUser(u)
  };
}

const authUser = (u: DemoUser): AuthUser =>
  ({ id: u.id, username: u.username, email: u.email, displayName: u.displayName, avatarUrl: u.avatarUrl, role: u.role });

function userFromToken(token: string | null | undefined, prefix: string): DemoUser | null {
  if (!token?.startsWith(prefix + '.')) return null;
  try {
    return userByName(dec(token.slice(prefix.length + 1)));
  } catch {
    return null;
  }
}

function currentUser(req: HttpRequest<unknown>): DemoUser | null {
  const h = req.headers.get('Authorization');
  return h?.startsWith('Bearer ') ? userFromToken(h.slice(7), 'demo-access') : null;
}

// ---------------------------------------------------------------- เมนู + ชั้นทับของแอดมิน

interface MenuOverride { hidden?: boolean; shortName?: string; tags?: string[]; imageUrl?: string; updatedAt: string; }
const overrides = new Map<string, MenuOverride>();

const recipeById = (id: string) => DEMO_RECIPES.find(r => r.id === id) ?? null;
const shortName = (r: DemoRecipe) => overrides.get(r.id)?.shortName ?? r.name;
const tagsOf = (r: DemoRecipe) => overrides.get(r.id)?.tags ?? r.tags;
const imageOf = (r: DemoRecipe) => overrides.get(r.id)?.imageUrl ?? r.image;
const isHidden = (r: DemoRecipe) => overrides.get(r.id)?.hidden === true;
const visible = () => DEMO_RECIPES.filter(r => !isHidden(r));
const calories = (r: DemoRecipe) => `${r.kcal} kcal`;

function allergyHits(r: DemoRecipe, a: AllergyValue | null | undefined): string[] {
  if (!a) return [];
  const words = [
    ...DEMO_ALLERGENS.filter(x => a.keys.includes(x.key)).flatMap(x => x.words),
    ...a.custom.map(c => c.trim()).filter(Boolean)
  ];
  return r.ingredients.map(i => i[0]).filter(name => words.some(w => name.includes(w)));
}

function highlights(r: DemoRecipe): RecipeChip[] {
  const out: RecipeChip[] = [];
  if (r.protein >= 25) out.push({ label: 'โปรตีนสูง', icon: 'protein' });
  if (r.kcal < 300) out.push({ label: 'แคลอรีไม่สูง', icon: 'heart' });
  if (r.prefs.includes('clean')) out.push({ label: 'เมนูเบา ๆ', icon: 'leaf' });
  out.push({ label: r.type, icon: 'plate' });
  out.push({ label: 'ทำได้ใน 30 นาที', icon: 'clock' });
  return out;
}

const card = (r: DemoRecipe): RecipeCard => ({
  id: r.id, name: shortName(r), title: r.menuName, description: r.description, imageUrl: imageOf(r),
  calories: calories(r), highlights: highlights(r)
});

// ---------------------------------------------------------------- สถานะต่อผู้ใช้

interface ManualMeal { id: string; recipeId: string; date: string; slot: string; at: number; }
interface DemoAnalysis {
  id: string; userId: string; date: string; createdAt: number; failedOnce: boolean;
  person: AnalysisResult['person']; answers: Record<string, string>;
  meals: { recipeId: string; slot: string }[];
}

const likes = new Map<string, Map<string, number>>();       // userId → recipeId → likedAt(ms)
const manualMeals = new Map<string, ManualMeal[]>();         // userId → รายการที่เพิ่มเอง
const excluded = new Map<string, Set<string>>();             // userId → id รายการที่ "ไม่ได้กิน"
const slotEdits = new Map<string, Map<string, string>>();    // userId → id รายการ → มื้อที่แก้
const analyses = new Map<string, DemoAnalysis[]>();
let seq = 1000;
const nextId = (p: string) => `${p}-${++seq}`;

const userLikes = (u: DemoUser) => likes.get(u.id) ?? likes.set(u.id, new Map()).get(u.id)!;
const userManual = (u: DemoUser) => manualMeals.get(u.id) ?? manualMeals.set(u.id, []).get(u.id)!;
const userExcluded = (u: DemoUser) => excluded.get(u.id) ?? excluded.set(u.id, new Set()).get(u.id)!;
const userSlotEdits = (u: DemoUser) => slotEdits.get(u.id) ?? slotEdits.set(u.id, new Map()).get(u.id)!;
const userAnalyses = (u: DemoUser) => analyses.get(u.id) ?? analyses.set(u.id, []).get(u.id)!;

/** ผู้ใช้ใหม่ทุกคนได้ประวัติตัวอย่าง: ถูกใจ 3 เมนูวันนี้ + ผลวิเคราะห์ย้อนหลังบางวัน (ให้หน้าประวัติ/Dashboard มีข้อมูล) */
function seedUserActivity(u: DemoUser): void {
  const base = Date.parse(today() + 'T00:00:00+07:00');
  const l = userLikes(u);
  l.set('115', base + 8 * 3_600_000);
  l.set('101', base + 12 * 3_600_000);
  l.set('112', base + 18 * 3_600_000);
  const list = userAnalyses(u);
  const pattern: [number, string[], Record<string, string>][] = [
    [-1, ['103', '113', '114'], { vegetables: 'often', sweet_drinks: '0', fried: '0' }],
    [-2, ['106', '108'], { vegetables: 'some', sweet_drinks: '1', fried: '1' }],
    [-3, ['111', '104', '102'], { vegetables: 'often', sweet_drinks: '0', fried: '0' }],
    [-5, ['107', '109'], { vegetables: 'none', sweet_drinks: '2+', fried: '2+' }],
    [-6, ['115', '105', '103'], { vegetables: 'some', sweet_drinks: '1', fried: '0' }],
    [-9, ['116', '112'], { vegetables: 'some', sweet_drinks: '1', fried: '1' }],
    [-13, ['101', '110', '114'], { vegetables: 'often', sweet_drinks: '0', fried: '1' }],
    [-20, ['107', '102'], { vegetables: 'none', sweet_drinks: '2+', fried: '2+' }]
  ];
  const slots = ['breakfast', 'lunch', 'dinner'];
  for (const [d, ids, answers] of pattern) {
    const date = shift(today(), d);
    list.push({
      id: nextId('an'), userId: u.id, date, createdAt: Date.parse(date + 'T20:00:00+07:00'), failedOnce: false,
      person: person(54 + (d % 2), 162, 24, 'female'), answers,
      meals: ids.map((recipeId, i) => ({ recipeId, slot: slots[i] ?? 'late' }))
    });
  }
}

// ---------------------------------------------------------------- BMI / คะแนน

const BMI_SCALE = [
  { below: 18.5, label: 'น้ำหนักน้อย', tone: 'warn' },
  { below: 23, label: 'น้ำหนักปกติ', tone: 'good' },
  { below: 25, label: 'น้ำหนักเกิน', tone: 'warn' },
  { below: 30, label: 'อ้วนระดับ 1', tone: 'bad' },
  { below: null, label: 'อ้วนระดับ 2', tone: 'bad' }
];

function bmi(w: number | null, h: number | null) {
  if (!w || !h) return null;
  const value = Math.round((w / ((h / 100) ** 2)) * 10) / 10;
  const level = BMI_SCALE.find(l => l.below === null || value < l.below)!;
  return { value, category: level.label, tone: level.tone };
}

function person(weightKg: number, heightCm: number, age: number, gender: string): AnalysisResult['person'] {
  const b = bmi(weightKg, heightCm);
  const genderLabel = gender === 'male' ? 'ชาย' : gender === 'female' ? 'หญิง' : 'อื่น ๆ';
  return { weightKg, heightCm, age, gender, genderLabel, bmi: b?.value ?? null, bmiCategory: b?.category ?? null };
}

function levelOf(total: number): LevelInfo {
  return total >= 80 ? { code: 'GOOD', label: 'ดีมาก', tone: 'good' }
    : total >= 60 ? { code: 'FAIR', label: 'พอใช้', tone: 'warn' }
      : { code: 'LOW', label: 'ควรปรับปรุง', tone: 'bad' };
}

const groupMarks = (present: Set<FoodGroupKey>): GroupMark[] =>
  GROUP_KEYS.map(key => ({ key, label: GROUP_LABELS[key].label, present: present.has(key) }));

function groupsOfMeals(meals: { recipeId: string }[]): Set<FoodGroupKey> {
  return new Set(meals.flatMap(m => recipeById(m.recipeId)?.groups ?? []));
}

function scoresOf(a: DemoAnalysis) {
  const groups = groupsOfMeals(a.meals);
  const pick = (v: string | undefined, table: Record<string, number>, dflt: number) => table[v ?? ''] ?? dflt;
  const beneficial = Math.min(25, groups.size * 5);
  const limit = pick(a.answers['fried'], { '0': 25, '1': 18, '2+': 9 }, 18);
  const sfs = pick(a.answers['sweet_drinks'], { '0': 25, '1': 17, '2+': 8 }, 17);
  const mealPts = [5, 13, 20, 25][Math.min(3, a.meals.length)];
  const pattern = Math.max(0, mealPts - (a.answers['vegetables'] === 'none' ? 6 : 0));
  const categories: ScoreInfo[] = [
    { key: 'beneficial', label: 'อาหารที่มีประโยชน์', icon: '🥦', score: beneficial, max: 25 },
    { key: 'limit', label: 'อาหารที่ควรจำกัด', icon: '🍟', score: limit, max: 25 },
    { key: 'sweet-fat-salt', label: 'หวาน มัน เค็ม', icon: '🧂', score: sfs, max: 25 },
    { key: 'pattern', label: 'รูปแบบการกิน', icon: '🕒', score: pattern, max: 25 }
  ];
  const total = categories.reduce((s, c) => s + c.score, 0);
  return { groups, categories, total, level: levelOf(total) };
}

function stateOf(a: DemoAnalysis): { status: AnalysisState; step: number } {
  const t = Date.now() - a.createdAt;
  if (t < 1200) return { status: 'FOOD_GROUPS', step: 1 };
  if (t < 2400) return { status: 'RISK', step: 2 };
  if (t < 3600) return { status: 'SUMMARY', step: 3 };
  return { status: 'DONE', step: 3 };
}

function adviceOf(missing: FoodGroupKey[]): string {
  return missing.length
    ? DEMO_TEXT.adviceMissing(missing.map(k => GROUP_LABELS[k].label).join(' '))
    : DEMO_TEXT.adviceGood;
}

function recommendFor(missing: FoodGroupKey[], n = 3) {
  const pool = visible().filter(r => missing.length === 0 || r.groups.some(g => missing.includes(g)));
  return pool.slice(0, n);
}

function resultOf(a: DemoAnalysis): AnalysisResult {
  const st = stateOf(a);
  const s = scoresOf(a);
  const missing = GROUP_KEYS.filter(k => !s.groups.has(k));
  const done = st.status === 'DONE';
  return {
    id: a.id, date: a.date, status: st.status, person: a.person,
    foodGroups: groupMarks(s.groups), missing, complete: missing.length === 0,
    scores: done ? { categories: s.categories, total: s.total, maxTotal: 100, level: s.level } : null,
    advice: done ? adviceOf(missing) : null,
    adviceSource: done ? 'template' : null,
    meals: a.meals.map(m => {
      const r = recipeById(m.recipeId);
      return { recipeId: m.recipeId, name: r ? shortName(r) : '-', mealLabel: slotLabel(m.slot), foodGroups: r?.groups ?? [] };
    }),
    recommendations: recommendFor(missing).map(r =>
      ({ id: r.id, name: shortName(r), menuName: r.menuName, imageUrl: imageOf(r), calories: calories(r) })),
    createdAt: new Date(a.createdAt).toISOString()
  };
}

/** ผลล่าสุดที่เสร็จแล้วของแต่ละวัน (เหมือนหน้าประวัติ/Dashboard ของระบบจริง) */
function dailyLatest(u: DemoUser): DemoAnalysis[] {
  const byDate = new Map<string, DemoAnalysis>();
  for (const a of userAnalyses(u)) {
    if (stateOf(a).status !== 'DONE') continue;
    const cur = byDate.get(a.date);
    if (!cur || cur.createdAt < a.createdAt) byDate.set(a.date, a);
  }
  return [...byDate.values()].sort((x, y) => y.date.localeCompare(x.date));
}

// ---------------------------------------------------------------- รายการมื้อของวัน (ตรวจสอบเมนูที่กิน)

function dayItems(u: DemoUser, date: string): ReviewItem[] {
  const ex = userExcluded(u);
  const edits = userSlotEdits(u);
  const out: ReviewItem[] = [];
  for (const [recipeId, at] of userLikes(u)) {
    if (thaiDate(at) !== date) continue;
    const r = recipeById(recipeId);
    const id = `like-${recipeId}-${date}`;
    if (!r || ex.has(id)) continue;
    const slot = edits.get(id) ?? slotOfHour(thaiHour(at));
    out.push(reviewItem(id, 'LIKE', r, at, slot));
  }
  for (const m of userManual(u)) {
    const r = recipeById(m.recipeId);
    if (m.date !== date || !r || ex.has(m.id)) continue;
    out.push(reviewItem(m.id, 'MANUAL', r, m.at, edits.get(m.id) ?? m.slot));
  }
  const order = MEAL_SLOTS.map(s => s.key);
  return out.sort((a, b) => order.indexOf(a.mealSlot) - order.indexOf(b.mealSlot) || a.likedAt.localeCompare(b.likedAt));
}

function reviewItem(id: string, source: 'LIKE' | 'MANUAL', r: DemoRecipe, at: number, slot: string): ReviewItem {
  return {
    id, source, recipeId: r.id, name: shortName(r), menuName: r.menuName, imageUrl: imageOf(r),
    likedAt: new Date(at).toISOString(), mealSlot: slot, mealLabel: slotLabel(slot), foodGroups: r.groups
  };
}

const MANUAL_LIMIT = 5;

function reviewView(u: DemoUser, date: string): ReviewView {
  const items = dayItems(u, date);
  const present = new Set(items.flatMap(i => i.foodGroups));
  const missing = GROUP_KEYS.filter(k => !present.has(k));
  return {
    date, today: date === today(), count: items.length, items,
    overview: {
      groups: groupMarks(present), missing, complete: missing.length === 0,
      message: items.length === 0 ? null
        : missing.length === 0 ? 'ครบ 5 หมู่แล้ว เยี่ยมมาก'
          : `ยังขาด ${missing.map(k => GROUP_LABELS[k].label).join(' ')}`
    },
    currentSlot: slotOfHour(thaiHour(Date.now())),
    manualCount: userManual(u).filter(m => m.date === date && !userExcluded(u).has(m.id)).length,
    manualLimit: MANUAL_LIMIT
  };
}

function itemDate(u: DemoUser, id: string): string | null {
  const like = /^like-(\d+)-(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (like) return like[2];
  return userManual(u).find(m => m.id === id)?.date ?? null;
}

// ---------------------------------------------------------------- โควตา (สุ่ม / แชต AI)

const quotaUsed = new Map<string, number>();   // "<kind>:<who>:<date>" → ใช้ไปแล้ว
const who = (u: DemoUser | null) => u?.id ?? 'guest';
function quota(kind: 'spin' | 'ai', u: DemoUser | null): SpinQuota {
  const limit = settingValue(`${kind}.${u ? 'user' : 'guest'}-limit`) as number;
  const used = quotaUsed.get(`${kind}:${who(u)}:${today()}`) ?? 0;
  return { remaining: Math.max(0, limit - used), limit, resetsAt: nextMidnightIso() };
}
function useQuota(kind: 'spin' | 'ai', u: DemoUser | null): void {
  const k = `${kind}:${who(u)}:${today()}`;
  quotaUsed.set(k, (quotaUsed.get(k) ?? 0) + 1);
}

// ---------------------------------------------------------------- ค่าตั้ง / ประวัติการแก้ไขของแอดมิน

const SETTING_DEFS: AppSetting['definition'][] = [
  { key: 'spin.guest-limit', group: 'โควตาสุ่มเมนู', label: 'ผู้ใช้ทั่วไป (ไม่เข้าสู่ระบบ) ต่อวัน', hint: 'ครั้ง/วัน', type: 'int', min: 1, max: 50, options: null },
  { key: 'spin.user-limit', group: 'โควตาสุ่มเมนู', label: 'สมาชิก ต่อวัน', hint: 'ครั้ง/วัน', type: 'int', min: 1, max: 100, options: null },
  { key: 'ai.guest-limit', group: 'โควตาแชต AI', label: 'ผู้ใช้ทั่วไป (ไม่เข้าสู่ระบบ) ต่อวัน', hint: 'ข้อความ/วัน', type: 'int', min: 1, max: 50, options: null },
  { key: 'ai.user-limit', group: 'โควตาแชต AI', label: 'สมาชิก ต่อวัน', hint: 'ข้อความ/วัน', type: 'int', min: 1, max: 100, options: null },
  { key: 'non-meal.exclude', group: 'เมนูที่ไม่ใช่มื้ออาหาร', label: 'ซ่อนเมนูที่ไม่ใช่มื้ออาหารจากการแนะนำ', hint: 'มีผลทันที', type: 'bool', min: null, max: null, options: null },
  { key: 'non-meal.categories', group: 'เมนูที่ไม่ใช่มื้ออาหาร', label: 'ประเภทที่ซ่อน', hint: 'เลือกได้หลายข้อ', type: 'categories', min: null, max: null, options: ['ของหวาน', 'เครื่องดื่ม', 'ขนมขบเคี้ยว'] }
];
const SETTING_DEFAULTS: Record<string, number | boolean | string[]> = {
  'spin.guest-limit': 5, 'spin.user-limit': 10, 'ai.guest-limit': 5, 'ai.user-limit': 20,
  'non-meal.exclude': true, 'non-meal.categories': ['ของหวาน', 'เครื่องดื่ม']
};
const settingOverrides = new Map<string, { value: number | boolean | string[]; at: string; by: string }>();
const settingValue = (key: string) => settingOverrides.get(key)?.value ?? SETTING_DEFAULTS[key];

function settingsView(): SettingsView {
  return {
    settings: SETTING_DEFS.map(definition => {
      const o = settingOverrides.get(definition.key);
      return {
        definition, value: settingValue(definition.key), defaultValue: SETTING_DEFAULTS[definition.key],
        overridden: !!o, updatedAt: o?.at ?? null, updatedBy: o?.by ?? null
      };
    }),
    readOnly: [{ name: 'กฎแชตแนะนำเมนู', description: 'ระบบจริงอ่านจากไฟล์กฎฝั่ง backend', content: '# โหมดเดโม: ไม่มีไฟล์กฎจริง\n# คำตอบแชตมาจากข้อความสำเร็จรูป' }]
  };
}

const ACTION_LABELS: Record<string, string> = {
  MENU_HIDE: 'ซ่อนเมนู', MENU_SHOW: 'เปิดเมนู', MENU_DISPLAY: 'แก้ชื่อ/แท็ก', MENU_IMAGE: 'เปลี่ยนรูปเมนู',
  MENU_REVERT: 'คืนค่าเมนู', USER_SUSPEND: 'ระงับบัญชี', USER_UNSUSPEND: 'ยกเลิกระงับ', USER_ROLE: 'เปลี่ยนสิทธิ์',
  SETTING_UPDATE: 'แก้ค่าตั้ง', SETTING_RESET: 'คืนค่าตั้งเริ่มต้น'
};
const TYPE_LABELS: Record<string, string> = { MENU: 'เมนู', USER: 'ผู้ใช้', SETTING: 'ค่าตั้ง' };
const audit: AuditEntry[] = [];
let auditSeq = 1;

function addAudit(admin: DemoUser | null, action: string, targetType: string, targetId: string | null,
                  targetName: string | null, before: unknown, after: unknown, reason: string | null, at = new Date().toISOString()): void {
  audit.unshift({
    id: auditSeq++, at, adminId: admin?.id ?? null, adminName: admin?.username ?? 'ระบบ', action,
    actionLabel: ACTION_LABELS[action] ?? action, targetType, targetId, targetName, before, after, reason
  });
}
addAudit(null, 'SETTING_UPDATE', 'SETTING', 'ai.user-limit', 'โควตาแชต AI', { value: 10 }, { value: 20 }, 'ตัวอย่างประวัติ',
  new Date(Date.now() - 3 * DAY_MS).toISOString());
addAudit(null, 'MENU_DISPLAY', 'MENU', '108', 'ก๋วยเตี๋ยวน้ำตกหมู', { shortName: 'ก๋วยเตี๋ยวหมู' },
  { shortName: 'ก๋วยเตี๋ยวน้ำตกหมู' }, 'ตัวอย่างประวัติ', new Date(Date.now() - DAY_MS).toISOString());

// ---------------------------------------------------------------- ผู้ใช้ในหน้าแอดมิน (บัญชีจำลอง)

const FAKE_MEMBERS: AdminUserRow[] = Array.from({ length: 14 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  const created = new Date(Date.now() - (30 - i * 2) * DAY_MS).toISOString();
  return {
    id: `member-${n}`, username: `member${n}`, email: `me***@example.com`, createdAt: created,
    lastActiveAt: i % 4 === 3 ? null : new Date(Date.now() - (i % 5) * DAY_MS).toISOString(),
    status: i === 6 ? 'suspended' : 'active', suspendedAt: i === 6 ? created : null,
    role: i === 0 ? 'ADMIN' : i === 1 ? 'REVIEWER' : 'USER', self: false
  };
});

const metric = (v: number): Metric => (v < 5 ? { value: null, label: 'น้อยกว่า 5' } : { value: v, label: v.toLocaleString('th-TH') });
const pseudo = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7);

function cardOf(cur: number, prev: number): OverviewCard {
  return {
    value: metric(cur), previous: metric(prev), isNew: prev === 0 && cur > 0,
    changePercent: prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null
  };
}

function slices(items: [string, string, number][]): Slice[] {
  const total = items.reduce((s, x) => s + x[2], 0) || 1;
  return items.map(([key, label, n]) =>
    ({ key, label, count: metric(n), percent: n < 5 ? null : Math.round((n / total) * 1000) / 10 }));
}

function dataStatus(): DataStatus {
  const hidden = DEMO_RECIPES.filter(isHidden).length;
  return {
    menusUpdatedAt: new Date(Date.now() - 2 * DAY_MS).toISOString(), totalMenus: DEMO_RECIPES.length,
    recommendedMenus: DEMO_RECIPES.length - hidden, hiddenMenus: hidden,
    menusWithImage: 0, menusWithoutImage: DEMO_RECIPES.length, recommendedWithoutImage: DEMO_RECIPES.length - hidden,
    products: [], ingredientsWithoutGroup: 0, ingredientsTotal: new Set(DEMO_RECIPES.flatMap(r => r.ingredients.map(i => i[0]))).size
  };
}

function rangeParams(req: HttpRequest<unknown>) {
  const to = req.params.get('to') || today();
  const from = req.params.get('from') || shift(to, -29);
  return { from, to };
}

function overview(req: HttpRequest<unknown>): Overview {
  const { from, to } = rangeParams(req);
  const days = datesBetween(from, to);
  const len = days.length;
  const prevTo = shift(from, -1);
  const prevFrom = shift(prevTo, -(len - 1));
  const trend = days.map(date => {
    const p = pseudo(date);
    return { date, newUsers: metric(p % 4), analyses: metric(6 + (p % 9)), recommendations: metric(15 + (p % 20)) };
  });
  const sum = (k: 'newUsers' | 'analyses' | 'recommendations') => trend.reduce((s, t) => s + (t[k].value ?? 2), 0);
  const top = [...visible()].sort((a, b) => pseudo(b.id) - pseudo(a.id)).slice(0, 5);
  return {
    from, to, previousFrom: prevFrom, previousTo: prevTo,
    cards: {
      users: cardOf(sum('newUsers'), Math.round(sum('newUsers') * 0.8)),
      analyses: cardOf(sum('analyses'), Math.round(sum('analyses') * 0.9)),
      recommendations: cardOf(sum('recommendations'), Math.round(sum('recommendations') * 1.1)),
      averageScore: cardOf(71, 68)
    },
    trend,
    gender: slices([['female', 'หญิง', 58], ['male', 'ชาย', 41], ['other', 'อื่น ๆ', 3], ['unknown', 'ไม่ระบุ', 12]]),
    age: slices([['18-24', '18–24 ปี', 46], ['25-34', '25–34 ปี', 38], ['35-44', '35–44 ปี', 17], ['45+', '45 ปีขึ้นไป', 6], ['unknown', 'ไม่ระบุ', 7]]),
    topMenus: top.map((r, i) => ({ rank: i + 1, id: r.id, name: shortName(r), imageUrl: imageOf(r), count: metric(40 - i * 6) })),
    activity: audit.slice(0, 5).map(e => ({
      kind: e.adminId ? 'admin' : 'system', icon: e.targetType === 'MENU' ? 'menu' : e.targetType === 'USER' ? 'user' : 'settings',
      title: e.actionLabel, detail: `${e.targetName ?? '-'} (ข้อมูลจำลอง)`, date: e.at.slice(0, 10), at: e.at
    })),
    dataStatus: dataStatus()
  };
}

function adminAnalysis(req: HttpRequest<unknown>): AnalysisOverview {
  const { from, to } = rangeParams(req);
  const area = (key: string, label: string, avg: number) => ({ key, label, average: { value: avg, label: avg.toFixed(1) }, max: 25 });
  return {
    from, to, people: metric(37), analyses: metric(124), averageTotal: { value: 70.4, label: '70.4' },
    areas: [area('beneficial', 'อาหารที่มีประโยชน์', 19.2), area('limit', 'อาหารที่ควรจำกัด', 17.5),
      area('sweet-fat-salt', 'หวาน มัน เค็ม', 15.1), area('pattern', 'รูปแบบการกิน', 18.6)],
    levels: slices([['GOOD', 'ดีมาก', 41], ['FAIR', 'พอใช้', 55], ['LOW', 'ควรปรับปรุง', 28]]),
    missingGroups: GROUP_KEYS.map((key, i) => ({ key, label: GROUP_LABELS[key].label, people: metric([6, 2, 21, 14, 3][i]), percent: [16.2, null, 56.8, 37.8, null][i] })),
    trend: datesBetween(from, to).map(date => {
      const p = pseudo(date);
      return { date, average: { value: 62 + (p % 18), label: String(62 + (p % 18)) }, analyses: metric(2 + (p % 7)) };
    }),
    maxPerArea: 25
  };
}

function menuRow(r: DemoRecipe): MenuRow {
  const o = overrides.get(r.id);
  return {
    id: r.id, shortName: shortName(r), sourceShortName: r.name, menuName: r.menuName, type: r.type,
    imageUrl: imageOf(r), hasImage: !!o?.imageUrl, recommended: !isHidden(r), hidden: isHidden(r),
    hiddenSources: isHidden(r) ? [{ key: 'admin', label: 'ซ่อนโดยแอดมิน' }] : [],
    visibility: o?.hidden === undefined ? null : o.hidden ? 'HIDDEN' : 'SHOWN',
    edited: !!o, popularity: metric(40 - (pseudo(r.id) % 38)), updatedAt: o?.updatedAt ?? null
  };
}

function menuDetail(r: DemoRecipe): MenuDetail {
  const o = overrides.get(r.id);
  const src = { shortName: r.name, tags: r.tags, imageUrl: r.image, credit: null };
  return {
    id: r.id, menuName: r.menuName, sourceUrl: null, scrapedAt: null, type: r.type, nonMealCategory: null,
    recommended: !isHidden(r), hidden: isHidden(r),
    hiddenSources: isHidden(r) ? [{ key: 'admin', label: 'ซ่อนโดยแอดมิน' }] : [], fileHidden: false,
    source: src,
    override: o ? {
      visibility: o.hidden === undefined ? null : o.hidden ? 'HIDDEN' : 'SHOWN', visibilityReason: null,
      shortName: o.shortName ?? null, tags: o.tags ?? null, imageUrl: o.imageUrl ?? null, credit: null,
      imageUploaded: !!o.imageUrl, updatedAt: o.updatedAt, updatedBy: 'demo_admin'
    } : null,
    effective: { shortName: shortName(r), tags: tagsOf(r), imageUrl: imageOf(r), credit: null },
    popularity: metric(40 - (pseudo(r.id) % 38)),
    history: audit.filter(e => e.targetType === 'MENU' && e.targetId === r.id)
  };
}

function setOverride(r: DemoRecipe, patch: Partial<MenuOverride>): void {
  const cur = overrides.get(r.id) ?? { updatedAt: '' };
  const next: MenuOverride = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  for (const k of Object.keys(next) as (keyof MenuOverride)[]) if (next[k] === undefined) delete next[k];
  if (Object.keys(next).length <= 1) overrides.delete(r.id); else overrides.set(r.id, next);
}

// ---------------------------------------------------------------- แชต AI (template)

interface ChatConditions { prefs: FoodPreferenceKey[]; tags: string[]; avoid: string[]; avoidPrefs: FoodPreferenceKey[]; want: string[]; count: number; labels: string[]; }
const chatConditions = new Map<string, { cond: ChatConditions; shown: Set<string> }>();
const MEAT_WORDS = ['หมู', 'ไก่', 'กุ้ง', 'ปลาหมึก', 'ปลา', 'ไข่', 'เนื้อ', 'เต้าหู้', 'กะทิ', 'ถั่ว'];
const FOOD_HINTS = ['กิน', 'ทาน', 'เมนู', 'อาหาร', 'หิว', 'มื้อ', 'แนะนำ', 'อร่อย', 'ข้าว', ...MEAT_WORDS];
const THAI_NUM: Record<string, number> = { 'หนึ่ง': 1, 'สอง': 2, 'สาม': 3, 'สี่': 4, 'ห้า': 5 };

function parseMessage(text: string): ChatConditions {
  const t = text.replace(/\s+/g, '');
  const neg = (w: string) => ['ไม่เอา', 'ไม่กิน', 'ไม่ใส่', 'ไม่ชอบ', 'แพ้', 'ไม่'].some(n => t.includes(n + w));
  const cond: ChatConditions = { prefs: [], tags: [], avoid: [], avoidPrefs: [], want: [], count: 3, labels: [] };
  for (const k of AI_KEYWORDS) {
    const hit = k.words.find(w => t.includes(w));
    if (!hit) continue;
    if (neg(hit)) {
      if (k.pref) cond.avoidPrefs.push(k.pref);
      cond.labels.push('ไม่' + k.label.replace(/^รส/, ''));
    } else {
      if (k.pref) cond.prefs.push(k.pref);
      if (k.tag) cond.tags.push(k.tag);
      cond.labels.push(k.label);
    }
  }
  for (const w of MEAT_WORDS) {
    if (!t.includes(w)) continue;
    if (neg(w)) { cond.avoid.push(w); cond.labels.push('ไม่มี' + w); } else { cond.want.push(w); cond.labels.push('มี' + w); }
  }
  const n = /(\d+)\s*(เมนู|อย่าง|จาน)/.exec(text)?.[1] ?? Object.keys(THAI_NUM).find(k => t.includes(k + 'เมนู') || t.includes(k + 'อย่าง'));
  if (n) cond.count = Math.min(5, Math.max(1, THAI_NUM[n] ?? Number(n)));
  return cond;
}

function chatPool(cond: ChatConditions, allergies: AllergyValue | null): DemoRecipe[] {
  const has = (r: DemoRecipe, w: string) => r.name.includes(w) || r.ingredients.some(i => i[0].includes(w));
  const pool = visible().filter(r =>
    allergyHits(r, allergies).length === 0
    && !cond.avoid.some(w => has(r, w))
    && !cond.avoidPrefs.some(p => r.prefs.includes(p)));
  const score = (r: DemoRecipe) =>
    cond.prefs.filter(p => r.prefs.includes(p)).length * 2
    + cond.tags.filter(tg => tagsOf(r).includes(tg)).length * 2
    + cond.want.filter(w => has(r, w)).length * 3;
  const wanted = cond.prefs.length + cond.tags.length + cond.want.length;
  return pool.map(r => ({ r, s: score(r) })).filter(x => wanted === 0 || x.s > 0)
    .sort((a, b) => b.s - a.s || pseudo(a.r.id + today()) - pseudo(b.r.id + today())).map(x => x.r);
}

function aiRecipe(r: DemoRecipe, u: DemoUser | null): AiRecipe {
  return { id: r.id, displayName: shortName(r), menuName: r.menuName, imageUrl: imageOf(r), calories: calories(r),
    tags: tagsOf(r).slice(0, 3), liked: !!u && userLikes(u).has(r.id) };
}

function conditionsToken(id: string): string {
  const body = btoa(JSON.stringify({ c: id, exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${body}.demo`;
}

function tokenId(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  try {
    const body = token.slice(0, token.lastIndexOf('.')).replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(body)) as { c?: string }).c ?? null;
  } catch {
    return null;
  }
}

function chat(req: HttpRequest<unknown>, u: DemoUser | null): DemoReply {
  const b = (req.body ?? {}) as Body;
  const allergies = u ? u.allergies : ((b['allergies'] as AllergyValue | undefined) ?? null);
  const q = quota('ai', u);
  const base = { notices: ['โหมดเดโม: คำตอบนี้มาจากข้อความสำเร็จรูป ไม่ได้เรียก LLM จริง'], unsupported: [] as string[], source: 'fallback' as const };

  let id: string;
  let entry: { cond: ChatConditions; shown: Set<string> };
  if (b['mode'] === 'more') {
    const tid = tokenId(b['conditionsToken']);
    const found = tid ? chatConditions.get(tid) : undefined;
    if (!tid || !found) return fail(400, 'เงื่อนไขหมดอายุแล้ว กรุณาพิมพ์คำขอใหม่', { error: 'CONDITIONS_EXPIRED' });
    id = tid;
    entry = found;
    for (const x of (b['excludeIds'] as string[] | undefined) ?? []) entry.shown.add(x);
  } else {
    const message = String(b['message'] ?? '').trim();
    if (!message) return fail(400, 'กรุณาพิมพ์ข้อความ');
    if (q.remaining <= 0) {
      return fail(429, 'ใช้แชตครบโควตาของวันนี้แล้ว (ข้อมูลจำลอง)', { error: 'QUOTA_EXCEEDED', retryAfterSeconds: 3600, remaining: 0, limit: q.limit });
    }
    useQuota('ai', u);
    const cond = parseMessage(message);
    const offTopic = cond.labels.length === 0 && !FOOD_HINTS.some(h => message.includes(h));
    if (offTopic) {
      const after = quota('ai', u);
      const res: AiChatResponse = {
        ...base, reply: 'ขอโทษนะ ผู้ช่วยนี้แนะนำได้เฉพาะเมนูอาหาร ลองพิมพ์ เช่น "อยากกินอะไรเผ็ด ๆ" หรือ "เมนูคลีน 2 เมนู"',
        recipes: [], requestedCount: 0, conditionsToken: '', offTopic: true, remaining: after.remaining, limit: after.limit
      };
      return ok(res);
    }
    id = nextId('chat');
    entry = { cond, shown: new Set() };
    chatConditions.set(id, entry);
  }

  let pool = chatPool(entry.cond, allergies);
  let fresh = pool.filter(r => !entry.shown.has(r.id));
  if (!fresh.length && pool.length) { entry.shown.clear(); fresh = pool; }
  pool = fresh.slice(0, entry.cond.count);
  pool.forEach(r => entry.shown.add(r.id));

  const why = entry.cond.labels.length ? `ตามเงื่อนไข ${entry.cond.labels.join(', ')} ` : '';
  const reply = pool.length
    ? `${why}ลองเมนูเหล่านี้ดูนะ: ${pool.map(r => shortName(r)).join(', ')} — ${pool[0].description}`
    : 'ไม่พบเมนูที่ตรงเงื่อนไขในข้อมูลตัวอย่าง ลองเปลี่ยนหรือลดเงื่อนไขดูนะ';
  const after = quota('ai', u);
  const res: AiChatResponse = {
    ...base, reply, recipes: pool.map(r => aiRecipe(r, u)), requestedCount: entry.cond.count,
    conditionsToken: conditionsToken(id), offTopic: false, remaining: after.remaining, limit: after.limit
  };
  return ok(res);
}

// ---------------------------------------------------------------- ตัวช่วย

const account = (u: DemoUser): Account => ({
  id: u.id, username: u.username, email: u.email, displayName: u.displayName, age: u.age, gender: u.gender,
  weightKg: u.weightKg, heightCm: u.heightCm, avatarUrl: u.avatarUrl, allergies: u.allergies,
  bmi: bmi(u.weightKg, u.heightCm), bmiScale: BMI_SCALE
});

function page<T>(all: T[], pageNo: number, size: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(all.length / size));
  return {
    content: all.slice(pageNo * size, pageNo * size + size), page: pageNo, size, totalElements: all.length,
    totalPages, hasNext: pageNo + 1 < totalPages
  };
}

const num = (v: string | null, d: number) => (v !== null && v !== '' && !isNaN(Number(v)) ? Number(v) : d);

function fileUrl(body: unknown): string | null {
  const f = body instanceof FormData ? body.get('file') : null;
  return f instanceof Blob ? URL.createObjectURL(f) : null;
}

const rangeStart = (range: HistoryRange) =>
  range === 'today' ? today() : range === '7d' ? shift(today(), -6) : range === '30d' ? shift(today(), -29) : null;

// ---------------------------------------------------------------- เส้นทาง

type Handler = (req: HttpRequest<unknown>, m: RegExpExecArray, u: DemoUser | null) => DemoReply;
interface Route { method: string; re: RegExp; auth?: 'user' | 'admin-read' | 'admin-write'; h: Handler; }

const R = (method: string, path: string, h: Handler, auth?: Route['auth']): Route =>
  ({ method, re: new RegExp('^' + path.replace(/:\w+/g, '([^/]+)') + '$'), h, auth });

const body = (req: HttpRequest<unknown>) => (req.body ?? {}) as Body;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const latestSpins = new Map<string, LatestSpin>();   // ผู้ใช้/guest → ผลสุ่มล่าสุด
const pendingEmail = new Map<string, string>();      // userId → อีเมลใหม่ที่รอยืนยัน OTP

const routes: Route[] = [
  // ---------- auth ----------
  R('POST', '/api/auth/login', req => {
    const b = body(req);
    const username = str(b['username']).trim();
    if (!username) return fail(400, 'กรุณากรอก Username', { fieldErrors: { username: 'กรุณากรอก Username' } });
    if (!str(b['password'])) return fail(400, 'กรุณากรอกรหัสผ่าน', { fieldErrors: { password: 'กรุณากรอกรหัสผ่าน' } });
    const u = userByName(username);
    if (u.suspendedAt) return fail(403, 'บัญชีนี้ถูกระงับ (ข้อมูลจำลอง)', { error: 'ACCOUNT_SUSPENDED' });
    return ok(tokensFor(u));
  }),
  R('POST', '/api/auth/register', req => {
    const b = body(req);
    const username = str(b['username']).trim();
    if (!username) return fail(400, 'กรุณากรอก Username', { fieldErrors: { username: 'กรุณากรอก Username' } });
    if (str(b['password']) !== str(b['confirmPassword'])) {
      return fail(400, 'รหัสผ่านไม่ตรงกัน', { fieldErrors: { confirmPassword: 'รหัสผ่านไม่ตรงกัน' } });
    }
    return ok(tokensFor(userByName(username, str(b['email']) || undefined)));
  }),
  R('POST', '/api/auth/logout', () => noContent()),
  R('POST', '/api/auth/refresh', req => {
    const u = userFromToken(str(body(req)['refreshToken']), 'demo-refresh');
    return u ? ok(tokensFor(u)) : fail(401, 'กรุณาเข้าสู่ระบบใหม่', { error: 'INVALID_REFRESH_TOKEN' });
  }),
  R('POST', '/api/auth/forgot-password', () =>
    ok({ message: 'โหมดเดโม: ไม่ได้ส่งอีเมลจริง กรอกรหัส OTP อะไรก็ได้ 6 หลัก', cooldownSeconds: 30, expiresInSeconds: 300 })),
  R('POST', '/api/auth/verify-otp', () => ok({ resetToken: 'demo-reset-token', expiresInSeconds: 600 })),
  R('POST', '/api/auth/reset-password', () => ok({ message: 'ตั้งรหัสผ่านใหม่แล้ว (โหมดเดโม ไม่ได้บันทึกจริง)' })),

  // ---------- บัญชีของฉัน ----------
  R('GET', '/api/users/me', (_r, _m, u) => ok(account(u!)), 'user'),
  R('PATCH', '/api/users/me', (req, _m, u) => {
    const b = body(req);
    const me = u!;
    if (typeof b['username'] === 'string' && b['username'].trim()) me.username = b['username'].trim();
    for (const k of ['age', 'gender', 'weightKg', 'heightCm'] as const) {
      if (k in b) (me as unknown as Body)[k] = b[k] ?? null;
    }
    if (b['allergies']) me.allergies = b['allergies'] as AllergyValue;
    return ok(account(me));
  }, 'user'),
  R('POST', '/api/users/me/email/verify-password', () => ok({ ticket: 'demo-ticket', expiresInSeconds: 600 }), 'user'),
  R('POST', '/api/users/me/email/otp', (req, _m, u) => {
    pendingEmail.set(u!.id, str(body(req)['newEmail']));
    return ok({ message: 'โหมดเดโม: ไม่ได้ส่งอีเมลจริง กรอก OTP อะไรก็ได้', cooldownSeconds: 30, expiresInSeconds: 300 });
  }, 'user'),
  R('POST', '/api/users/me/email/confirm', (_r, _m, u) => {
    const next = pendingEmail.get(u!.id);
    if (next) u!.email = next;
    pendingEmail.delete(u!.id);
    return ok(account(u!));
  }, 'user'),
  R('POST', '/api/users/me/password/otp', () =>
    ok({ message: 'โหมดเดโม: ไม่ได้ส่งอีเมลจริง กรอก OTP อะไรก็ได้', cooldownSeconds: 30, expiresInSeconds: 300 }), 'user'),
  R('POST', '/api/users/me/password/verify-otp', () => ok({ resetToken: 'demo-reset-token', expiresInSeconds: 600 }), 'user'),
  R('POST', '/api/users/me/password/reset', () => ok({ message: 'เปลี่ยนรหัสผ่านแล้ว (โหมดเดโม ไม่ได้บันทึกจริง)' }), 'user'),
  R('POST', '/api/users/me/avatar', (req, _m, u) => { u!.avatarUrl = fileUrl(req.body); return ok(account(u!)); }, 'user'),
  R('DELETE', '/api/users/me/avatar', (_r, _m, u) => { u!.avatarUrl = null; return ok(account(u!)); }, 'user'),
  R('GET', '/api/users/me/food-preferences', (_r, _m, u) => ok({ preferences: u!.prefs }), 'user'),
  R('PUT', '/api/users/me/food-preferences', (req, _m, u) => {
    u!.prefs = (body(req)['preferences'] as FoodPreferenceKey[] | undefined) ?? [];
    return ok({ preferences: u!.prefs });
  }, 'user'),

  // ---------- เมนูที่ถูกใจ ----------
  R('GET', '/api/users/me/liked-recipes', (req, _m, u) => {
    const list: LikedRecipe[] = [...userLikes(u!)].sort((a, b) => b[1] - a[1]).flatMap(([id, at]) => {
      const r = recipeById(id);
      return r ? [{ recipe: { id, menuName: r.menuName, imageUrl: imageOf(r) }, likedAt: new Date(at).toISOString(),
        displayName: shortName(r), calories: calories(r) }] : [];
    });
    return ok(page(list, num(req.params.get('page'), 0), num(req.params.get('size'), 12)));
  }, 'user'),
  R('GET', '/api/users/me/liked-recipes/:id', (_r, m, u) => ok({ liked: userLikes(u!).has(m[1]) }), 'user'),
  R('POST', '/api/recipes/:id/like', (_r, m, u) => {
    if (!recipeById(m[1])) return fail(404, 'ไม่พบเมนู');
    if (!userLikes(u!).has(m[1])) userLikes(u!).set(m[1], Date.now());
    return noContent();
  }, 'user'),
  R('DELETE', '/api/recipes/:id/like', (_r, m, u) => { userLikes(u!).delete(m[1]); return noContent(); }, 'user'),

  // ---------- ประวัติ / Dashboard ----------
  R('GET', '/api/users/me/history/summary', (req, _m, u) => {
    const range = (req.params.get('range') ?? '7d') as HistoryRange;
    const from = rangeStart(range);
    const list = dailyLatest(u!).filter(a => !from || a.date >= from);
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
    const labels: Record<HistoryRange, string> = { today: 'วันนี้', '7d': '7 วันล่าสุด', '30d': '30 วันล่าสุด', all: 'ทั้งหมด' };
    const res: HistorySummary = {
      range, rangeLabel: labels[range] ?? range, from, to: today(),
      avgMealsPerDay: avg(list.map(a => a.meals.length)), avgScore: avg(list.map(a => scoresOf(a).total)), maxScore: 100
    };
    return ok(res);
  }, 'user'),
  R('GET', '/api/users/me/history/analyses', (req, _m, u) => {
    const from = rangeStart((req.params.get('range') ?? '7d') as HistoryRange);
    const list: AnalysisEntry[] = dailyLatest(u!).filter(a => !from || a.date >= from).map(a => {
      const s = scoresOf(a);
      return {
        id: a.id, recordedDate: a.date, itemCount: a.meals.length, foodGroups: groupMarks(s.groups),
        score: s.total, maxScore: 100, status: { ...s.level }, note: null
      };
    });
    return ok(page(list, num(req.params.get('page'), 0), 10));
  }, 'user'),
  R('GET', '/api/users/me/dashboard', (req, _m, u) => {
    const range = req.params.get('range') === '1d' ? '1d' : '7d';
    const from = range === '1d' ? today() : shift(today(), -6);
    const all = dailyLatest(u!);
    const list = all.filter(a => a.date >= from);
    const latest = list[0] ?? null;
    const scores = list.map(a => scoresOf(a));
    const score = scores.length ? Math.round(scores.reduce((s, x) => s + x.total, 0) / scores.length) : null;
    const union = new Set(scores.flatMap(s => [...s.groups]));
    const macro = list.flatMap(a => a.meals).map(m => recipeById(m.recipeId)).filter((r): r is DemoRecipe => !!r);
    const days = Math.max(1, list.length);
    const pct = (sum: number, target: number) => Math.round((sum / days / target) * 100);
    const nutrient = (key: string, label: string, sum: number, target: number, unit: string) => {
      const p = pct(sum, target);
      return { key, label, percent: list.length ? p : null, detailText: list.length ? `เฉลี่ย ${Math.round(sum / days)} ${unit}/วัน` : '-',
        status: list.length ? (p < 70 ? { label: 'ค่อนข้างน้อย', tone: 'low' } : p > 130 ? { label: 'ค่อนข้างมาก', tone: 'warn' } : { label: 'พอดี', tone: 'good' }) : null };
    };
    const missing = GROUP_KEYS.filter(k => !union.has(k));
    const res: DashboardView = {
      range, rangeLabel: range === '1d' ? 'วันนี้' : '7 วันล่าสุด', from, to: today(), hasAnyAnalysis: all.length > 0,
      daysWithData: list.length, score, maxScore: 100, level: score === null ? null : levelOf(score),
      foodGroups: list.length ? {
        count: union.size, max: 5,
        dots: GROUP_KEYS.map(key => ({ key, label: GROUP_LABELS[key].label, present: union.has(key),
          daysPresent: scores.filter(s => s.groups.has(key)).length }))
      } : null,
      groupStatus: list.length ? (missing.length ? { label: `ขาด ${missing.length} หมู่`, tone: 'warn' } : { label: 'ครบ 5 หมู่', tone: 'good' }) : null,
      mealCount: list.length ? macro.length : null,
      nutrients: [
        nutrient('protein', 'โปรตีน', macro.reduce((s, r) => s + r.protein, 0), 60, 'กรัม'),
        nutrient('carbohydrate', 'คาร์โบไฮเดรต', macro.reduce((s, r) => s + r.carb, 0), 250, 'กรัม'),
        nutrient('fat', 'ไขมัน', macro.reduce((s, r) => s + r.fat, 0), 65, 'กรัม')
      ],
      nutrientBasis: 'คำนวณจากเมนูตัวอย่างที่บันทึก (ค่าประมาณของโหมดเดโม)',
      nutrientNote: 'ตัวเลขเป็นข้อมูลจำลอง ไม่ใช่คำแนะนำทางการแพทย์',
      latestAnalysisId: latest?.id ?? null,
      advice: latest ? adviceOf(missing) : null, adviceSource: latest ? 'template' : null
    };
    return ok(res);
  }, 'user'),
  R('GET', '/api/users/me/dashboard/trends', (req, _m, u) => {
    const days = (req.params.get('days') === '30' ? 30 : 7) as TrendDays;
    const from = shift(today(), -(days - 1));
    const byDate = new Map(dailyLatest(u!).map(a => [a.date, a]));
    const points = datesBetween(from, today()).map(date => {
      const a = byDate.get(date);
      const s = a ? scoresOf(a) : null;
      return { date, score: s?.total ?? null, analysisId: a?.id ?? null, level: s ? s.level : null };
    });
    const rec = points.filter(p => p.score !== null);
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
    const prev = datesBetween(shift(from, -days), shift(from, -1)).map(d => byDate.get(d)).filter((a): a is DemoAnalysis => !!a);
    const average = avg(rec.map(p => p.score!));
    const prevAvg = avg(prev.map(a => scoresOf(a).total));
    const recorded = rec.map(p => byDate.get(p.date)!);
    const missingGroups = GROUP_KEYS.map(key => ({
      key, label: GROUP_LABELS[key].label, labelWithExample: `${GROUP_LABELS[key].label} (${GROUP_LABELS[key].example})`,
      missedDays: recorded.filter(a => !scoresOf(a).groups.has(key)).length, recordedDays: recorded.length
    }));
    const most = [...missingGroups].sort((a, b) => b.missedDays - a.missedDays)[0];
    const mostMissed = most && most.missedDays > 0 ? most : null;
    const res: TrendsView = {
      days, from, to: today(), maxScore: 100, points, recordedDays: rec.length, enough: rec.length >= 2, average,
      changeFromPrevious: average !== null && prevAvg !== null ? average - prevAvg : null,
      bands: [{ from: 80, to: 100, tone: 'good', label: 'ดี' }, { from: 60, to: 79, tone: 'fair', label: 'พอใช้' },
        { from: 0, to: 59, tone: 'low', label: 'ควรปรับปรุง' }],
      missingGroups, mostMissedGroup: mostMissed,
      recommendations: mostMissed ? recommendFor([mostMissed.key as FoodGroupKey]).map(r =>
        ({ id: r.id, name: shortName(r), menuName: r.menuName, imageUrl: imageOf(r), foodGroups: r.groups })) : []
    };
    return ok(res);
  }, 'user'),

  // ---------- เมนู ----------
  R('GET', '/api/recipes', req => {
    const tags = (req.params.get('tags') ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const ex = (req.params.get('excludeTags') ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const list = visible().filter(r => (!tags.length || tags.some(t => tagsOf(r).includes(t))) && !ex.some(t => tagsOf(r).includes(t)));
    const size = num(req.params.get('size'), 10);
    const p = page(list.map(r => ({ id: r.id, menuName: r.menuName, displayName: shortName(r), imageUrl: imageOf(r), calories: calories(r) })),
      num(req.params.get('page'), 0), size);
    return ok(p);
  }),
  R('GET', '/api/recipes/search', (req, _m, u) => {
    const q = (req.params.get('q') ?? '').trim();
    const list: MenuSearchItem[] = visible()
      .filter(r => !q || shortName(r).includes(q) || r.menuName.includes(q))
      .filter(r => !u || allergyHits(r, u.allergies).length === 0)
      .slice(0, 20).map(r => ({ id: r.id, name: shortName(r), menuName: r.menuName, imageUrl: imageOf(r), foodGroups: r.groups }));
    return ok(list);
  }),
  R('GET', '/api/recipes/:id', (_r, m, u) => {
    const r = recipeById(m[1]);
    if (!r) return fail(404, 'ไม่พบเมนูนี้', { error: 'RECIPE_NOT_FOUND' });
    const hits = u ? allergyHits(r, u.allergies) : [];
    const res: RecipeDetailView = {
      id: r.id, menuName: r.menuName, displayName: shortName(r), description: r.description, imageUrl: imageOf(r),
      imageCredit: null, sourceUrl: null, calories: calories(r), highlights: highlights(r),
      nutrition: { proteinG: r.protein, carbohydrateG: r.carb, fatG: r.fat },
      allergyMatches: hits.length ? hits : null,
      ingredients: r.ingredients.map(([name, qty], i) =>
        ({ ingredientId: `${r.id}-${i}`, name, quantityText: qty, imageUrl: null, linkUrl: null, products: [] })),
      steps: r.steps.map((text, i) => ({ stepNumber: i + 1, heading: null, text }))
    };
    return ok(res);
  }),
  R('GET', '/api/allergens', () => {
    const res: AllergenOptions = { items: DEMO_ALLERGENS.map(a => ({ key: a.key, label: a.label })), customMaxItems: 5, customMaxLength: 30 };
    return ok(res);
  }),
  R('GET', '/api/food-preferences/options', () => ok({ hidden: settingValue('non-meal.exclude') ? ['sweet'] : [] })),

  // ---------- สุ่มเมนู ----------
  R('GET', '/api/recommend/random/quota', (_r, _m, u) => ok(quota('spin', u))),
  R('POST', '/api/recommend/random/spin', (req, _m, u) => {
    const q = quota('spin', u);
    if (q.remaining <= 0) return fail(429, 'ใช้สิทธิ์สุ่มครบแล้ววันนี้ (ข้อมูลจำลอง)', { error: 'SPIN_QUOTA_EXCEEDED', resetsAt: q.resetsAt });
    const b = body(req);
    const prefs = u ? (u.prefs ?? []) : ((b['preferences'] as FoodPreferenceKey[] | undefined) ?? []);
    const allergies = u ? u.allergies : ((b['allergies'] as AllergyValue | undefined) ?? null);
    const safe = visible().filter(r => allergyHits(r, allergies).length === 0);
    const matched = safe.filter(r => !prefs.length || r.prefs.some(p => prefs.includes(p)));
    const pool = matched.length ? matched : safe;
    if (!pool.length) return fail(404, 'ไม่พบเมนูที่ตรงเงื่อนไข', { error: 'NO_RECIPE' });
    const last = latestSpins.get(who(u))?.recipe.id;
    const choices = pool.length > 1 ? pool.filter(r => r.id !== last) : pool;
    const r = choices[Math.floor(Math.random() * choices.length)];
    useQuota('spin', u);
    const after = quota('spin', u);
    const res: SpinResult = { ...after, spinId: nextId('spin'), recipe: card(r), liked: !!u && userLikes(u).has(r.id) };
    latestSpins.set(who(u), { spinId: res.spinId, recipe: res.recipe, liked: res.liked, spunAt: new Date().toISOString() });
    return ok(res);
  }),
  R('GET', '/api/recommend/random/latest', (_r, _m, u) => {
    const l = latestSpins.get(who(u));
    if (!l || thaiDate(Date.parse(l.spunAt)) !== today()) return noContent();
    return ok({ ...l, liked: !!u && userLikes(u).has(l.recipe.id) });
  }),
  R('POST', '/api/recommend/random/banner', (req, _m, u) => {
    const allergies = u ? u.allergies : ((body(req)['allergies'] as AllergyValue | undefined) ?? null);
    const list: BannerItem[] = visible().filter(r => allergyHits(r, allergies).length === 0).slice(0, 10)
      .map(r => ({ id: r.id, name: shortName(r), imageUrl: imageOf(r) }));
    return ok(list);
  }),

  // ---------- แชต AI ----------
  R('GET', '/api/recommend/ai/config', (_r, _m, u) => {
    const q = quota('ai', u);
    const res: AiChatConfig = { chips: AI_CHIPS, maxLength: 300, maxCount: 5, remaining: q.remaining, limit: q.limit };
    return ok(res);
  }),
  R('POST', '/api/recommend/ai/chat', (req, _m, u) => chat(req, u)),

  // ---------- วิเคราะห์ ----------
  R('GET', '/api/analyses/config', () => {
    const res: AnalysisConfig = {
      foodGroups: GROUP_KEYS.map(key => ({ key, label: GROUP_LABELS[key].label, example: GROUP_LABELS[key].example })),
      questions: ANALYSIS_QUESTIONS, today: today(), reviewDays: 7, dailyLimit: 5, mealSlots: MEAL_SLOTS,
      manualMealsPerDay: MANUAL_LIMIT
    };
    return ok(res);
  }),
  R('GET', '/api/analyses/review', (req, _m, u) => ok(reviewView(u!, req.params.get('date') || today())), 'user'),
  R('POST', '/api/analyses/review/meals', (req, _m, u) => {
    const b = body(req);
    const date = str(b['date']) || today();
    const r = recipeById(str(b['recipeId']));
    if (!r) return fail(404, 'ไม่พบเมนู');
    if (reviewView(u!, date).manualCount >= MANUAL_LIMIT) return fail(400, `เพิ่มเมนูเองได้ไม่เกิน ${MANUAL_LIMIT} รายการต่อวัน`);
    userManual(u!).push({ id: nextId('meal'), recipeId: r.id, date, slot: str(b['mealSlot']) || 'lunch', at: Date.now() });
    return ok(reviewView(u!, date));
  }, 'user'),
  R('PATCH', '/api/analyses/review/meals/:id', (req, m, u) => {
    const id = decodeURIComponent(m[1]);
    const date = itemDate(u!, id);
    if (!date) return fail(404, 'ไม่พบรายการ');
    const b = body(req);
    if (typeof b['mealSlot'] === 'string') userSlotEdits(u!).set(id, b['mealSlot']);
    if (b['excluded'] === true) userExcluded(u!).add(id);
    if (b['excluded'] === false) userExcluded(u!).delete(id);
    return ok(reviewView(u!, date));
  }, 'user'),
  R('DELETE', '/api/analyses/review/meals/:id', (_r, m, u) => {
    const id = decodeURIComponent(m[1]);
    const date = itemDate(u!, id);
    if (!date) return fail(404, 'ไม่พบรายการ');
    userExcluded(u!).add(id);
    return ok(reviewView(u!, date));
  }, 'user'),
  R('GET', '/api/analyses/latest-summary', (_r, _m, u) => {
    const done = userAnalyses(u!).filter(a => stateOf(a).status === 'DONE').sort((a, b) => b.createdAt - a.createdAt);
    const [latest, prev] = done;
    const s = latest ? scoresOf(latest) : null;
    const res: LatestSummary = {
      latest: latest && s ? { id: latest.id, date: latest.date, totalScore: s.total, maxScore: 100, level: s.level } : null,
      delta: latest && prev ? s!.total - scoresOf(prev).total : null,
      todayCount: userAnalyses(u!).filter(a => thaiDate(a.createdAt) === today()).length
    };
    return ok(res);
  }, 'user'),
  R('POST', '/api/analyses', (req, _m, u) => {
    const b = body(req) as unknown as CreateAnalysis;
    const todayCount = userAnalyses(u!).filter(a => thaiDate(a.createdAt) === today()).length;
    if (todayCount >= 5) return fail(429, 'วิเคราะห์ครบ 5 ครั้งของวันนี้แล้ว (ข้อมูลจำลอง)', { error: 'ANALYSIS_DAILY_LIMIT' });
    const date = b.date || today();
    const meals = dayItems(u!, date).map(i => ({ recipeId: i.recipeId, slot: i.mealSlot }));
    if (!meals.length) return fail(400, 'ยังไม่มีเมนูของวันนี้ ลองกดถูกใจหรือเพิ่มเมนูก่อน');
    const a: DemoAnalysis = {
      id: nextId('an'), userId: u!.id, date, createdAt: Date.now(), failedOnce: false,
      person: person(b.weightKg, b.heightCm, b.age, b.gender), answers: b.answers ?? {}, meals
    };
    Object.assign(u!, { weightKg: b.weightKg, heightCm: b.heightCm, age: b.age, gender: b.gender });
    userAnalyses(u!).push(a);
    return ok({ id: a.id });
  }, 'user'),
  R('GET', '/api/analyses/:id/status', (_r, m, u) => {
    const a = userAnalyses(u!).find(x => x.id === m[1]);
    if (!a) return fail(404, 'ไม่พบผลวิเคราะห์');
    const res: AnalysisStatus = { id: a.id, ...stateOf(a), failureReason: null };
    return ok(res);
  }, 'user'),
  R('POST', '/api/analyses/:id/retry', (_r, m, u) => {
    const a = userAnalyses(u!).find(x => x.id === m[1]);
    if (!a) return fail(404, 'ไม่พบผลวิเคราะห์');
    a.createdAt = Date.now();
    const res: AnalysisStatus = { id: a.id, ...stateOf(a), failureReason: null };
    return ok(res);
  }, 'user'),
  R('GET', '/api/analyses/:id', (_r, m, u) => {
    const a = userAnalyses(u!).find(x => x.id === m[1]);
    return a ? ok(resultOf(a)) : fail(404, 'ไม่พบผลวิเคราะห์', { error: 'ANALYSIS_NOT_FOUND' });
  }, 'user'),

  // ---------- แอดมิน ----------
  R('GET', '/api/admin/me', (_r, _m, u) => {
    const res: AdminMe = { id: u!.id, username: u!.username, displayName: u!.displayName, avatarUrl: u!.avatarUrl,
      role: u!.role === 'REVIEWER' ? 'REVIEWER' : 'ADMIN' };
    return ok(res);
  }, 'admin-read'),
  R('GET', '/api/admin/notifications', () => {
    const list: AdminNotification[] = [
      { key: 'demo-images', title: 'เมนูที่ยังใช้ภาพตัวอย่าง', detail: 'ทุกเมนูในเดโมใช้ภาพ placeholder', count: DEMO_RECIPES.length, link: '/admin/menus', severity: 'info' }
    ];
    return ok(list);
  }, 'admin-read'),
  R('GET', '/api/admin/overview', req => ok(overview(req)), 'admin-read'),
  R('GET', '/api/admin/data-status', () => ok(dataStatus()), 'admin-read'),
  R('GET', '/api/admin/analysis', req => ok(adminAnalysis(req)), 'admin-read'),
  R('GET', '/api/admin/menus', req => {
    const q = (req.params.get('q') ?? '').trim();
    const type = req.params.get('type') ?? '';
    const status = req.params.get('status') ?? '';
    const image = req.params.get('image') ?? '';
    const sort = req.params.get('sort') ?? '';
    const rows = DEMO_RECIPES.map(menuRow);
    const byStatus: Record<string, (r: MenuRow) => boolean> = {
      recommended: r => r.recommended, hidden: r => r.hidden, 'admin-hidden': r => r.visibility === 'HIDDEN',
      'admin-shown': r => r.visibility === 'SHOWN', 'non-meal': () => false, suspect: () => false, edited: r => r.edited
    };
    let list = rows.filter(r => (!q || r.shortName.includes(q) || r.menuName.includes(q)) && (!type || r.type === type)
      && (!status || (byStatus[status]?.(r) ?? true)) && (!image || (image === 'has' ? r.hasImage : !r.hasImage)));
    list = [...list].sort(sort === 'popular' ? (a, b) => (b.popularity.value ?? 0) - (a.popularity.value ?? 0)
      : sort === 'updated' ? (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
        : (a, b) => a.shortName.localeCompare(b.shortName, 'th'));
    const pageNo = num(req.params.get('page'), 0);
    const size = num(req.params.get('size'), 20);
    const res: MenuPage = {
      items: list.slice(pageNo * size, pageNo * size + size), page: pageNo, size, total: list.length,
      counts: {
        all: rows.length, recommended: rows.filter(r => r.recommended).length, hidden: rows.filter(r => r.hidden).length,
        adminHidden: rows.filter(r => r.visibility === 'HIDDEN').length, nonMeal: 0, suspect: 0,
        noImage: rows.filter(r => !r.hasImage).length, edited: rows.filter(r => r.edited).length
      },
      types: [...new Set(DEMO_RECIPES.map(r => r.type))]
    };
    return ok(res);
  }, 'admin-read'),
  R('GET', '/api/admin/menus/:id', (_r, m) => {
    const r = recipeById(m[1]);
    return r ? ok(menuDetail(r)) : fail(404, 'ไม่พบเมนู');
  }, 'admin-read'),
  R('PUT', '/api/admin/menus/:id/visibility', (req, m, u) => {
    const r = recipeById(m[1]);
    if (!r) return fail(404, 'ไม่พบเมนู');
    const hide = body(req)['action'] === 'hide';
    const before = { hidden: isHidden(r) };
    setOverride(r, { hidden: hide });
    addAudit(u, hide ? 'MENU_HIDE' : 'MENU_SHOW', 'MENU', r.id, shortName(r), before, { hidden: hide }, str(body(req)['reason']) || null);
    return ok(menuDetail(r));
  }, 'admin-write'),
  R('PUT', '/api/admin/menus/:id/display', (req, m, u) => {
    const r = recipeById(m[1]);
    if (!r) return fail(404, 'ไม่พบเมนู');
    const b = body(req);
    const before = { shortName: shortName(r), tags: tagsOf(r) };
    setOverride(r, { shortName: str(b['shortName']) || undefined, tags: (b['tags'] as string[] | null) ?? undefined });
    addAudit(u, 'MENU_DISPLAY', 'MENU', r.id, shortName(r), before, { shortName: shortName(r), tags: tagsOf(r) }, str(b['reason']) || null);
    return ok(menuDetail(r));
  }, 'admin-write'),
  R('POST', '/api/admin/menus/:id/image', (req, m, u) => {
    const r = recipeById(m[1]);
    if (!r) return fail(404, 'ไม่พบเมนู');
    const url = fileUrl(req.body);
    if (url) setOverride(r, { imageUrl: url });
    const reason = req.body instanceof FormData ? String(req.body.get('reason') ?? '') : '';
    addAudit(u, 'MENU_IMAGE', 'MENU', r.id, shortName(r), null, { image: url ? 'อัปโหลดในเบราว์เซอร์ (ไม่บันทึกจริง)' : 'แก้เครดิต' }, reason || null);
    return ok(menuDetail(r));
  }, 'admin-write'),
  R('POST', '/api/admin/menus/:id/revert', (req, m, u) => {
    const r = recipeById(m[1]);
    if (!r) return fail(404, 'ไม่พบเมนู');
    const parts = (body(req)['parts'] as string[] | undefined) ?? [];
    setOverride(r, {
      ...(parts.includes('visibility') ? { hidden: undefined } : {}),
      ...(parts.includes('display') ? { shortName: undefined, tags: undefined } : {}),
      ...(parts.includes('image') ? { imageUrl: undefined } : {})
    });
    addAudit(u, 'MENU_REVERT', 'MENU', r.id, shortName(r), { parts }, null, str(body(req)['reason']) || null);
    return ok(menuDetail(r));
  }, 'admin-write'),
  R('GET', '/api/admin/users', (req, _m, u) => {
    const q = (req.params.get('q') ?? '').trim().toLowerCase();
    const status = req.params.get('status') ?? '';
    const role = req.params.get('role') ?? '';
    const self: AdminUserRow = { id: u!.id, username: u!.username, email: 'de***@example.com', createdAt: u!.createdAt,
      lastActiveAt: new Date().toISOString(), status: 'active', suspendedAt: null, role: u!.role, self: true };
    const all = [self, ...FAKE_MEMBERS];
    const list = all.filter(x => (!q || x.username.toLowerCase().includes(q)) && (!status || x.status === status) && (!role || x.role === role));
    const pageNo = num(req.params.get('page'), 0);
    const res: AdminUserPage = {
      items: list.slice(pageNo * 20, pageNo * 20 + 20), page: pageNo, size: 20, total: list.length,
      counts: { all: all.length, active: all.filter(x => x.status === 'active').length,
        suspended: all.filter(x => x.status === 'suspended').length, admins: all.filter(x => x.role !== 'USER').length }
    };
    return ok(res);
  }, 'admin-read'),
  R('PUT', '/api/admin/users/:id/status', (req, m, u) => {
    const row = FAKE_MEMBERS.find(x => x.id === m[1]);
    if (!row) return fail(400, 'แก้สถานะบัญชีของตัวเองไม่ได้');
    const suspend = body(req)['action'] === 'suspend';
    const before = { status: row.status };
    row.status = suspend ? 'suspended' : 'active';
    row.suspendedAt = suspend ? new Date().toISOString() : null;
    addAudit(u, suspend ? 'USER_SUSPEND' : 'USER_UNSUSPEND', 'USER', row.id, row.username, before, { status: row.status }, str(body(req)['reason']) || null);
    return ok(row);
  }, 'admin-write'),
  R('PUT', '/api/admin/users/:id/role', (req, m, u) => {
    const row = FAKE_MEMBERS.find(x => x.id === m[1]);
    if (!row) return fail(400, 'เปลี่ยนสิทธิ์ของตัวเองไม่ได้');
    const before = { role: row.role };
    row.role = (body(req)['role'] as UserRole) ?? row.role;
    addAudit(u, 'USER_ROLE', 'USER', row.id, row.username, before, { role: row.role }, str(body(req)['reason']) || null);
    return ok(row);
  }, 'admin-write'),
  R('GET', '/api/admin/settings', () => ok(settingsView()), 'admin-read'),
  R('PUT', '/api/admin/settings', (req, _m, u) => {
    const values = (body(req)['values'] as Record<string, number | boolean | string[]> | undefined) ?? {};
    for (const [key, value] of Object.entries(values)) {
      if (!(key in SETTING_DEFAULTS)) continue;
      const before = settingValue(key);
      settingOverrides.set(key, { value, at: new Date().toISOString(), by: u!.username });
      addAudit(u, 'SETTING_UPDATE', 'SETTING', key, SETTING_DEFS.find(d => d.key === key)?.label ?? key, { value: before }, { value }, str(body(req)['reason']) || null);
    }
    return ok(settingsView());
  }, 'admin-write'),
  R('POST', '/api/admin/settings/reset', (req, _m, u) => {
    for (const key of (body(req)['keys'] as string[] | undefined) ?? []) {
      if (!settingOverrides.has(key)) continue;
      const before = settingValue(key);
      settingOverrides.delete(key);
      addAudit(u, 'SETTING_RESET', 'SETTING', key, SETTING_DEFS.find(d => d.key === key)?.label ?? key, { value: before }, { value: SETTING_DEFAULTS[key] }, str(body(req)['reason']) || null);
    }
    return ok(settingsView());
  }, 'admin-write'),
  R('GET', '/api/admin/audit', req => {
    const p = req.params;
    const from = p.get('from') ?? '0000-01-01';
    const to = p.get('to') ?? '9999-12-31';
    const list = audit.filter(e => e.at.slice(0, 10) >= from && e.at.slice(0, 10) <= to
      && (!p.get('admin') || e.adminId === p.get('admin')) && (!p.get('type') || e.targetType === p.get('type'))
      && (!p.get('action') || e.action === p.get('action')));
    const pageNo = num(p.get('page'), 0);
    const admins = [...new Map(audit.filter(e => e.adminId).map(e => [e.adminId!, e.adminName ?? ''])).entries()]
      .map(([id, username]) => ({ id, username }));
    const res: AuditPage = { items: list.slice(pageNo * 20, pageNo * 20 + 20), page: pageNo, size: 20, total: list.length,
      admins, actions: ACTION_LABELS, types: TYPE_LABELS };
    return ok(res);
  }, 'admin-read')
];

/** จับคู่คำขอกับเส้นทาง — ไม่พบ = 404 (ช่วยให้เห็นว่า endpoint ไหนยังไม่ได้จำลอง) */
export function handleDemoRequest(req: HttpRequest<unknown>): DemoReply {
  const path = req.url.split('?')[0];
  const u = currentUser(req);
  for (const route of routes) {
    if (route.method !== req.method) continue;
    const m = route.re.exec(path);
    if (!m) continue;
    if (route.auth && !u) return fail(401, 'กรุณาเข้าสู่ระบบ', { error: 'UNAUTHORIZED' });
    if (route.auth?.startsWith('admin') && u!.role === 'USER') return fail(403, 'ต้องเป็นแอดมิน', { error: 'FORBIDDEN' });
    if (route.auth === 'admin-write' && u!.role === 'REVIEWER') return fail(403, 'บัญชีดูอย่างเดียว', { error: 'FORBIDDEN' });
    return route.h(req, m, u);
  }
  console.warn('[demo] ไม่มีข้อมูลจำลองสำหรับ', req.method, path);
  return fail(404, 'โหมดเดโมยังไม่มีข้อมูลจำลองสำหรับคำขอนี้', { error: 'DEMO_NOT_MOCKED' });
}

/** ปุ่มทางลัดบนแถบเดโม — สร้าง session แบบเดียวกับ /api/auth/login */
export function demoLogin(username: 'demo_user' | 'demo_admin'): TokenResponse {
  return tokensFor(userByName(username));
}
