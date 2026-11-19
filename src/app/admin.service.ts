import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { UserRole } from './auth.service';

/** ตัวตนของแอดมินที่ login (GET /api/admin/me) */
export interface AdminMe {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** REVIEWER = ดูอย่างเดียว */
  role: 'ADMIN' | 'REVIEWER';
}

/** เรื่องที่ต้องจัดการ (กระดิ่ง) — link = หน้าแอดมินที่เกี่ยวข้อง */
export interface AdminNotification {
  key: string;
  title: string;
  detail: string;
  count: number;
  link: string;
  severity: 'warn' | 'info';
}

export interface ProductSourceStatus {
  source: string;
  label: string;
  products: number;
  updatedAt: string | null;
  stale: boolean;
}

/** การ์ด "สถานะข้อมูล" (อ่านอย่างเดียว) */
export interface DataStatus {
  menusUpdatedAt: string | null;
  totalMenus: number;
  recommendedMenus: number;
  hiddenMenus: number;
  menusWithImage: number;
  menusWithoutImage: number;
  recommendedWithoutImage: number;
  products: ProductSourceStatus[];
  ingredientsWithoutGroup: number;
  ingredientsTotal: number;
}

/** ตัวเลขที่ผ่านกติกาความเป็นส่วนตัว: value = null เมื่อมาจากผู้ใช้น้อยกว่า 5 คน (label = 'น้อยกว่า 5') */
export interface Metric {
  value: number | null;
  label: string;
}

export interface Slice {
  key: string;
  label: string;
  count: Metric;
  percent: number | null;
}

export interface OverviewCard {
  value: Metric;
  changePercent: number | null;
  previous: Metric;
  /** ช่วงก่อนเป็น 0 แต่ช่วงนี้มีค่า → แสดง "ใหม่" แทน % */
  isNew: boolean;
}

export interface OverviewTrendPoint {
  date: string;
  newUsers: Metric;
  analyses: Metric;
  recommendations: Metric;
}

export interface TopMenu {
  rank: number;
  id: string;
  name: string;
  imageUrl: string | null;
  count: Metric;
}

export interface Activity {
  kind: 'system' | 'admin';
  icon: string;
  title: string;
  detail: string;
  date: string;
  at: string | null;
}

export interface Overview {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  cards: { users: OverviewCard; analyses: OverviewCard; recommendations: OverviewCard; averageScore: OverviewCard };
  trend: OverviewTrendPoint[];
  gender: Slice[];
  age: Slice[];
  topMenus: TopMenu[];
  activity: Activity[];
  dataStatus: DataStatus;
}

export interface HiddenSource { key: 'admin' | 'suspect' | 'non-meal'; label: string; }

export interface MenuRow {
  id: string;
  shortName: string;
  sourceShortName: string;
  menuName: string;
  type: string;
  imageUrl: string | null;
  hasImage: boolean;
  recommended: boolean;
  hidden: boolean;
  hiddenSources: HiddenSource[];
  visibility: 'HIDDEN' | 'SHOWN' | null;
  edited: boolean;
  popularity: Metric;
  updatedAt: string | null;
}

export interface MenuPage {
  items: MenuRow[];
  page: number;
  size: number;
  total: number;
  counts: { all: number; recommended: number; hidden: number; adminHidden: number; nonMeal: number; suspect: number; noImage: number; edited: number };
  types: string[];
}

export interface MenuFilter { q?: string; type?: string; status?: string; image?: string; sort?: string; page?: number; size?: number; }

/** เครดิตรูป (รูปแบบเดียวกับ recipe.image_credit) */
export interface ImageCredit { site?: string; photographer?: string; url?: string; page?: string; license?: string; ai?: boolean; style?: string; }

export interface MenuValues { shortName: string; tags: string[]; imageUrl: string | null; credit: ImageCredit | null; }

export interface AuditEntry {
  id: number;
  at: string;
  adminId: string | null;
  adminName: string | null;
  action: string;
  actionLabel: string;
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
}

export interface MenuDetail {
  id: string;
  menuName: string;
  sourceUrl: string | null;
  scrapedAt: string | null;
  type: string;
  nonMealCategory: string | null;
  recommended: boolean;
  hidden: boolean;
  hiddenSources: HiddenSource[];
  fileHidden: boolean;
  source: MenuValues;
  override: {
    visibility: 'HIDDEN' | 'SHOWN' | null; visibilityReason: string | null; shortName: string | null; tags: string[] | null;
    imageUrl: string | null; credit: ImageCredit | null; imageUploaded: boolean; updatedAt: string; updatedBy: string | null;
  } | null;
  effective: MenuValues;
  popularity: Metric;
  history: AuditEntry[];
}

export interface CreditInput { site: string; url: string; photographer: string; license: string; }

export interface AdminUserRow {
  id: string;
  username: string;
  /** ปิดบางส่วนแล้ว เช่น us***@example.com */
  email: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  status: 'active' | 'suspended';
  suspendedAt: string | null;
  role: UserRole;
  self: boolean;
}

export interface AdminUserPage {
  items: AdminUserRow[];
  page: number;
  size: number;
  total: number;
  counts: { all: number; active: number; suspended: number; admins: number };
}

export interface AnalysisOverview {
  from: string;
  to: string;
  people: Metric;
  analyses: Metric;
  averageTotal: Metric;
  areas: { key: string; label: string; average: Metric; max: number }[];
  levels: Slice[];
  missingGroups: { key: string; label: string; people: Metric; percent: number | null }[];
  trend: { date: string; average: Metric; analyses: Metric }[];
  maxPerArea: number;
}

export interface SettingDefinition {
  key: string;
  group: string;
  label: string;
  hint: string;
  type: 'int' | 'bool' | 'categories';
  min: number | null;
  max: number | null;
  options: string[] | null;
}

export interface AppSetting {
  definition: SettingDefinition;
  value: number | boolean | string[];
  defaultValue: number | boolean | string[];
  overridden: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SettingsView {
  settings: AppSetting[];
  readOnly: { name: string; description: string; content: string }[];
}

export interface AuditPage {
  items: AuditEntry[];
  page: number;
  size: number;
  total: number;
  admins: { id: string; username: string }[];
  actions: Record<string, string>;
  types: Record<string, string>;
}

/**
 * API ของระบบแอดมิน (/api/admin/**) — backend ตรวจ role ADMIN ทุกคำขอ (ไม่ login 401, ผู้ใช้ทั่วไป 403).
 * ข้อมูลทุกตัวมาจาก DB จริง; จำนวนคนที่น้อยกว่า 5 มาเป็น { value: null, label: 'น้อยกว่า 5' }
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  /** true = บัญชีผู้ประเมิน (REVIEWER): หน้าแอดมินปิดปุ่ม/ช่องแก้ไขทั้งหมด (backend ตอบ 403 อยู่แล้ว — นี่คือหน้าตา) */
  readonly readOnly = signal(false);

  me() {
    return this.http.get<AdminMe>('/api/admin/me').pipe(tap(m => this.readOnly.set(m.role === 'REVIEWER')));
  }

  notifications() {
    return this.http.get<AdminNotification[]>('/api/admin/notifications');
  }

  overview(from: string, to: string) {
    return this.http.get<Overview>('/api/admin/overview', { params: { from, to } });
  }

  menus(f: MenuFilter) {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && v !== '') params[k] = String(v);
    return this.http.get<MenuPage>('/api/admin/menus', { params });
  }

  menu(id: string) {
    return this.http.get<MenuDetail>(`/api/admin/menus/${id}`);
  }

  setMenuVisibility(id: string, action: 'hide' | 'show', reason: string) {
    return this.http.put<MenuDetail>(`/api/admin/menus/${id}/visibility`, { action, reason });
  }

  updateMenuDisplay(id: string, shortName: string | null, tags: string[] | null, reason: string) {
    return this.http.put<MenuDetail>(`/api/admin/menus/${id}/display`, { shortName, tags, reason });
  }

  /** file = null → แก้เครดิตอย่างเดียว */
  updateMenuImage(id: string, file: File | null, credit: CreditInput, reason: string) {
    const body = new FormData();
    if (file) body.append('file', file);
    for (const [k, v] of Object.entries(credit)) if (v) body.append(k, v);
    if (reason) body.append('reason', reason);
    return this.http.post<MenuDetail>(`/api/admin/menus/${id}/image`, body);
  }

  revertMenu(id: string, parts: ('visibility' | 'display' | 'image')[], reason: string) {
    return this.http.post<MenuDetail>(`/api/admin/menus/${id}/revert`, { parts, reason });
  }

  users(q: string, status: string, role: string, page: number) {
    const params: Record<string, string> = { page: String(page) };
    if (q) params['q'] = q;
    if (status) params['status'] = status;
    if (role) params['role'] = role;
    return this.http.get<AdminUserPage>('/api/admin/users', { params });
  }

  setUserStatus(id: string, action: 'suspend' | 'unsuspend', reason: string) {
    return this.http.put<AdminUserRow>(`/api/admin/users/${id}/status`, { action, reason });
  }

  setUserRole(id: string, role: UserRole, reason: string) {
    return this.http.put<AdminUserRow>(`/api/admin/users/${id}/role`, { role, reason });
  }

  analysis(from: string, to: string) {
    return this.http.get<AnalysisOverview>('/api/admin/analysis', { params: { from, to } });
  }

  settings() {
    return this.http.get<SettingsView>('/api/admin/settings');
  }

  updateSettings(values: Record<string, unknown>, reason: string) {
    return this.http.put<SettingsView>('/api/admin/settings', { values, reason });
  }

  resetSettings(keys: string[], reason: string) {
    return this.http.post<SettingsView>('/api/admin/settings/reset', { keys, reason });
  }

  audit(f: { admin?: string; type?: string; action?: string; from: string; to: string; page: number }) {
    const params: Record<string, string> = { from: f.from, to: f.to, page: String(f.page) };
    if (f.admin) params['admin'] = f.admin;
    if (f.type) params['type'] = f.type;
    if (f.action) params['action'] = f.action;
    return this.http.get<AuditPage>('/api/admin/audit', { params });
  }

  dataStatus() {
    return this.http.get<DataStatus>('/api/admin/data-status');
  }
}
