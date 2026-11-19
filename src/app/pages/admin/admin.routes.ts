import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './admin-layout.component';
import { AdminOverviewComponent } from './overview/admin-overview.component';
import { AdminMenusComponent } from './menus/admin-menus.component';
import { AdminUsersComponent } from './users/admin-users.component';
import { AdminAnalysisComponent } from './analysis/admin-analysis.component';
import { AdminSettingsComponent } from './settings/admin-settings.component';
import { AdminAuditComponent } from './audit/admin-audit.component';

/**
 * /admin/** (lazy — ผู้ใช้ทั่วไปไม่ต้องโหลด). adminGuard ใน app.routes ตรวจกับ backend ก่อนเข้า.
 * data: title / subtitle = หัวหน้า, range = แสดงตัวเลือกช่วงวันที่ · title (นอก data) = ชื่อแท็บของเบราว์เซอร์
 */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      { path: '', component: AdminOverviewComponent, title: 'แดชบอร์ดผู้ดูแลระบบ | KinRaiDee',
        data: { title: 'แดชบอร์ดผู้ดูแลระบบ', subtitle: 'ภาพรวมการใช้งานและข้อมูลของระบบ Kinrai', range: true } },
      { path: 'users', component: AdminUsersComponent, title: 'ผู้ใช้ (ผู้ดูแลระบบ) | KinRaiDee', data: { title: 'ผู้ใช้', subtitle: 'รายชื่อและสถานะบัญชี' } },
      { path: 'menus', component: AdminMenusComponent, title: 'ข้อมูลอาหาร (ผู้ดูแลระบบ) | KinRaiDee', data: { title: 'ข้อมูลอาหาร', subtitle: 'เมนู รูป และการซ่อนเมนู' } },
      { path: 'analysis', component: AdminAnalysisComponent, title: 'ภาพรวมการวิเคราะห์ (ผู้ดูแลระบบ) | KinRaiDee',
        data: { title: 'ภาพรวมการวิเคราะห์', subtitle: 'สถิติรวมแบบไม่ระบุตัวตน', range: true } },
      { path: 'audit', component: AdminAuditComponent, title: 'ประวัติการแก้ไข (ผู้ดูแลระบบ) | KinRaiDee',
        data: { title: 'ประวัติการแก้ไข', subtitle: 'ทุกการแก้ไขของผู้ดูแลระบบ พร้อมค่าก่อน/หลังและเหตุผล', range: true } },
      { path: 'settings', component: AdminSettingsComponent, title: 'ตั้งค่า (ผู้ดูแลระบบ) | KinRaiDee', data: { title: 'ตั้งค่า', subtitle: 'โควตาและการแสดงเมนู' } },
      { path: '**', redirectTo: '' }
    ]
  }
];
