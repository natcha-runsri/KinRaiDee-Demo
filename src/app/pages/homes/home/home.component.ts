import { MenuImageComponent } from '../../../shared/menu-image/menu-image.component';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../auth.service';
import { FoodPreferenceKey, FoodPreferenceService } from '../../../food-preference.service';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { FoodPreferenceChoice, FoodPreferenceDialogComponent } from '../../../shared/food-preference-dialog/food-preference-dialog.component';
import { AllergyValue, NO_ALLERGIES } from '../../../allergy.service';
import { catchError, forkJoin, of } from 'rxjs';

interface MenuItem {
  id: string;
  name: string;
  fullName: string;
  /** ยังไม่มีข้อมูลแคลอรี่รายเมนู → null (ซ่อน ไม่แสดง 0) */
  calories: string | null;
  imageUrl: string | null;
  category: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [MenuImageComponent, CommonModule, RouterModule, NavbarComponent, FoodPreferenceDialogComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {

  /** pop-up ความชอบ (ก่อนเข้าโหมดสุ่ม) */
  preferenceDialogOpen = false;
  preferenceSaving = false;
  preferenceError = '';
  /** ขั้นที่ 2 ของ pop-up: login = อาหารที่แพ้ในโปรไฟล์ */
  preferenceAllergies: AllergyValue | null = null;
  /** กำลังเช็คว่าผู้ใช้ login มีความชอบใน DB หรือยัง (กันกดรัว) */
  checkingPreference = false;

  // label ตรงกับ tag ในภาพ: อาหารตามสั่ง / เมนูอาหารเย็น / เมนูอาหารไทย
  filterTags = [
    { key: 'ordered', label: 'อาหารตามสั่ง' },
    { key: 'dinner',  label: 'เมนูอาหารเย็น' },
    { key: 'thai',    label: 'เมนูอาหารไทย' },
  ];

  activeFilter = 'ordered';
  menuItems: MenuItem[] = [];
  isLoadingMenu = false;
  loadError = false;

  constructor(
    public authService: AuthService,
    private router: Router,
    private http: HttpClient,
    private foodPreferences: FoodPreferenceService
  ) {}

  ngOnInit(): void {
    this.loadMenu(this.activeFilter);
  }

  setFilter(key: string): void {
    if (this.activeFilter === key) return;
    this.activeFilter = key;
    this.loadMenu(key);
  }

  /** ดึงเมนูแนะนำจากตารางจริงฝั่ง backend ตามหมวดที่เลือก */
  private loadMenu(category: string): void {
    this.isLoadingMenu = true;
    this.loadError = false;

    const tagByCategory: Record<string, string> = {
      ordered: 'อาหารตามสั่ง',
      dinner: 'เมนูกับข้าว',
      thai: 'เมนูผัด'
    };
    const tag = tagByCategory[category];
    // แท็บ "เมนูอาหารไทย" (tag เมนูผัด) ไม่แสดงเมนูที่มี tag อาหารต่างชาติ — เมนูฟิวชันไทย (ไม่มี tag เหล่านี้) ยังแสดง
    const excludeTagsByCategory: Record<string, string> = {
      thai: 'อาหารเกาหลี,อาหารญี่ปุ่น,อาหารฝรั่ง,อาหารเม็กซิกัน'
    };
    const params: Record<string, string> = { tags: tag, size: '10', sort: 'newest' };
    if (excludeTagsByCategory[category]) params['excludeTags'] = excludeTagsByCategory[category];

    this.http.get<{ content: Array<{ id: string; menuName: string; displayName: string | null; imageUrl: string | null; calories: string | null }> }>('/api/recipes', {
      params
    }).subscribe({
      next: (response) => {
        this.menuItems = response.content.map((recipe) => ({
          id: recipe.id,
          // ชื่อสั้นแบบหน้าอื่น (backend ตัด "วิธีทำ …"/คำโปรย) — ไม่มี → ชื่อเต็ม
          name: recipe.displayName || recipe.menuName,
          fullName: recipe.menuName,
          imageUrl: recipe.imageUrl,
          category,
          calories: recipe.calories ?? null
        }));
        this.isLoadingMenu = false;
      },
      error: () => {
        this.menuItems = [];
        this.isLoadingMenu = false;
        this.loadError = true;
      }
    });
  }

  /**
   * "เริ่มสุ่มเมนู"
   * - login: มีความชอบใน DB แล้ว → ไปหน้าโหมดสุ่มทันที, ยังไม่มี → pop-up → บันทึก → ไป
   * - guest: pop-up ทุกครั้ง (ไม่มีค่าติ๊กไว้) → เก็บในหน่วยความจำ → ไป
   * pop-up มี 2 ขั้น (ความชอบ → อาหารที่แพ้); login ติ๊กอาหารที่แพ้จากโปรไฟล์ไว้ให้ก่อน
   */
  goToRandomMenu(): void {
    if (this.checkingPreference) return;
    this.preferenceError = '';
    if (!this.authService.isLoggedIn()) {
      this.foodPreferences.clearGuest();
      this.preferenceAllergies = null;
      this.preferenceDialogOpen = true;
      return;
    }
    this.checkingPreference = true;
    forkJoin([
      this.foodPreferences.loadForUser(),
      this.foodPreferences.loadAllergiesForUser().pipe(catchError(() => of(NO_ALLERGIES)))
    ]).subscribe({
      next: ([prefs, allergies]) => {
        this.checkingPreference = false;
        if (prefs) {
          void this.router.navigate(['/recommend/random']);
        } else {
          this.preferenceAllergies = allergies;
          this.preferenceDialogOpen = true;
        }
      },
      error: () => {
        // token ใช้ไม่ได้แล้ว (interceptor ล้าง session) → ไปต่อแบบ guest
        this.checkingPreference = false;
        this.preferenceDialogOpen = true;
      }
    });
  }

  onPreferenceConfirmed(choice: FoodPreferenceChoice): void {
    if (!this.authService.isLoggedIn()) {
      this.foodPreferences.setGuest(choice.preferences);
      this.foodPreferences.setGuestAllergies(choice.allergies);
      this.preferenceDialogOpen = false;
      void this.router.navigate(['/recommend/random']);
      return;
    }
    this.preferenceSaving = true;
    this.preferenceError = '';
    this.foodPreferences.saveForUserWithAllergies(choice.preferences, choice.allergies).subscribe({
      next: () => {
        this.preferenceSaving = false;
        this.preferenceDialogOpen = false;
        void this.router.navigate(['/recommend/random']);
      },
      error: (err) => {
        this.preferenceSaving = false;
        this.preferenceError = this.saveError(err);
      }
    });
  }

  /** login: PATCH /me 400 (อาหารที่แพ้ผิด) → ข้อความจาก backend, อื่น ๆ → ข้อความทั่วไป */
  private saveError(err: unknown): string {
    const e = (err as { error?: { fieldErrors?: Record<string, string> } })?.error;
    return e?.fieldErrors?.['allergies'] ?? 'บันทึกความชอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
  }


  /** ปิด pop-up โดยไม่เลือก → ไม่บันทึก ไม่ไปหน้าโหมดสุ่ม */
  onPreferenceDismissed(): void {
    this.preferenceDialogOpen = false;
  }

  goToAskAi(): void {
    void this.router.navigate(['/recommend/ai']);
  }

  goToMenuItem(item: MenuItem): void {
    void this.router.navigate(['/menu', item.id]);
  }
}
