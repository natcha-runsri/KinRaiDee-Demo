import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogComponent } from './shared/confirm-dialog/confirm-dialog.component';
import { LogoutService } from './logout.service';
import { AiChatStateService } from './ai-chat-state.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConfirmDialogComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'frontend';

  /** aiChat: สร้างตั้งแต่เปิดแอป → ผู้ใช้เปลี่ยน (logout/login) ล้างแชตที่เก็บไว้ทันที แม้ยังไม่ได้เข้าหน้าแชต */
  constructor(readonly logout: LogoutService, private aiChat: AiChatStateService) {}
}
