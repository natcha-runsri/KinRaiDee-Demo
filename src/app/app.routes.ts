import { Routes } from '@angular/router';
import { KinraiComponent } from './pages/kinrai/kinrai.component';
import { RandomModeComponent } from './pages/recommend/random-mode/random-mode.component';
import { MenuDetailComponent } from './pages/menu/menu-detail/menu-detail.component';
import { HomeComponent } from './pages/homes/home/home.component';
import { AiChatComponent } from './pages/recommend/ai-chat/ai-chat.component';
import { AnalysisComponent } from './pages/homes/analysis/analysis.component';
import { HistoryComponent } from './pages/homes/history/history.component';
import { LikedRecipesComponent } from './pages/homes/history/liked/liked-recipes.component';
import { AnalysisReviewComponent } from './pages/analysis/review/analysis-review.component';
import { AnalysisProcessingComponent } from './pages/analysis/processing/analysis-processing.component';
import { AnalysisResultComponent } from './pages/analysis/result/analysis-result.component';
import { LoginComponent } from './pages/homes/login/login.component';
import { RegisterComponent } from './pages/homes/register/register.component';
import { ProfileLayoutComponent } from './pages/profile/profile-layout.component';
import { AccountComponent } from './pages/profile/account/account.component';
import { ProfileDashboardComponent } from './pages/profile/profile-dashboard.component';
import { NotFoundComponent } from './pages/not-found/not-found.component';
import { authGuard, loginOrGuestPage, unsavedChangesGuard } from './auth.guard';
import { adminGuard } from './admin.guard';

// title = ชื่อแท็บ "<ชื่อหน้า> | KinRaiDee" (ชื่อตามเมนู navbar / sidebar) — ทุก route ที่แสดงหน้าต้องมี ไม่งั้นแท็บค้างชื่อหน้าก่อน
export const routes: Routes = [
  { path: '', component: KinraiComponent, title: 'KinRaiDee — มื้อนี้กินไรดี' },
  { path: 'home', component: HomeComponent, title: 'หน้าหลัก | KinRaiDee' },
  // โหมดสุ่มเมนู (แท็บ "แนะนำ" active เพราะอยู่ใต้ /recommend)
  { path: 'recommend/random', component: RandomModeComponent, title: 'สุ่มเมนู | KinRaiDee' },
  { path: 'random-menu', redirectTo: 'recommend/random' },
  // รายละเอียดเมนู (public) — การ์ดเมนูหน้า home และปุ่มถูกใจในหน้าผลสุ่มลิงก์มาที่นี่
  { path: 'menu/:id', component: MenuDetailComponent, title: 'รายละเอียดเมนู | KinRaiDee' },
  // แนะนำเมนูด้วย AI แบบแชต (login + guest) — แท็บ "แนะนำ" (/recommend) และ /ask-ai เดิมพามาที่นี่
  { path: 'recommend/ai', component: AiChatComponent, title: 'แนะนำเมนู | KinRaiDee' },
  { path: 'recommend', redirectTo: 'recommend/ai', pathMatch: 'full' },
  { path: 'ask-ai', redirectTo: 'recommend/ai' },
  // หน้าโปรไฟล์ (ต้อง login) — เมนู "ประวัติ" ใน sidebar ไปที่ /history
  {
    path: 'profile',
    component: ProfileLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: AccountComponent, canDeactivate: [unsavedChangesGuard], title: 'บัญชีของฉัน | KinRaiDee' },
      { path: 'dashboard', component: ProfileDashboardComponent, title: 'Dashboard | KinRaiDee' },
      { path: 'history', redirectTo: '/history' }
    ]
  },
  // ประวัติการใช้งาน — ทุกคนเข้าได้ (ไม่ login เห็นหน้าชวนเข้าสู่ระบบ); เมนูที่ถูกใจทั้งหมดต้อง login
  { path: 'history', component: HistoryComponent, title: 'ประวัติ | KinRaiDee' },
  { path: 'history/liked', component: LikedRecipesComponent, canActivate: [authGuard], title: 'เมนูที่ถูกใจ | KinRaiDee' },
  // วิเคราะห์พฤติกรรมการกิน — หน้าแรกทุกคนเข้าได้, หน้าอื่นต้อง login (แท็บ "วิเคราะห์" active ทุกหน้า)
  { path: 'analysis', component: AnalysisComponent, title: 'วิเคราะห์ | KinRaiDee' },
  // หน้าย่อยวิเคราะห์: ไม่ login → /analysis (หน้าชวนเข้าสู่ระบบ) พร้อม returnUrl
  { path: 'analysis/review', component: AnalysisReviewComponent, canActivate: [loginOrGuestPage('/analysis')],
    title: 'ตรวจสอบเมนูที่กิน | KinRaiDee' },
  { path: 'analysis/processing/:id', component: AnalysisProcessingComponent, canActivate: [loginOrGuestPage('/analysis')],
    title: 'กำลังวิเคราะห์ | KinRaiDee' },
  { path: 'analysis/result/:id', component: AnalysisResultComponent, canActivate: [loginOrGuestPage('/analysis')],
    title: 'ผลการวิเคราะห์ | KinRaiDee' },
  // ระบบแอดมิน (lazy) — guard ถาม backend ว่าเป็น ADMIN จริง (/api/admin/me) ไม่เชื่อ role ในเบราว์เซอร์
  { path: 'admin', canActivate: [adminGuard], loadChildren: () => import('./pages/admin/admin.routes').then(m => m.ADMIN_ROUTES) },
  { path: 'login', component: LoginComponent, title: 'เข้าสู่ระบบ | KinRaiDee' },
  { path: 'register', component: RegisterComponent, title: 'สมัครสมาชิก | KinRaiDee' },
  { path: 'signup', redirectTo: 'register' },
  // หน้า forgot-password เดิมเปลี่ยนเป็น pop-up บนหน้า Login
  { path: 'forgot-password', redirectTo: '/login?forgot=1' },
  // URL ที่ไม่มีอยู่จริง → หน้าไม่พบ (ต้องอยู่ท้ายสุด)
  { path: '**', component: NotFoundComponent, title: 'ไม่พบหน้า | KinRaiDee' }
]; 
