import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from '../../shared/navbar/navbar.component';

/** หน้าไม่พบ (route `**`) — URL ที่ไม่มีอยู่จริง: navbar + ข้อความสั้น ๆ + ปุ่มกลับหน้าหลัก */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterModule, NavbarComponent],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.css'
})
export class NotFoundComponent {}
