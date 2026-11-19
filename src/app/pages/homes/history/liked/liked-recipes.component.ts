import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { NavbarComponent } from '../../../../shared/navbar/navbar.component';
import { ConfirmDialogComponent } from '../../../../shared/confirm-dialog/confirm-dialog.component';
import { HistoryService, LikedRecipe, Page } from '../../../../history.service';
import { LikedCardComponent } from '../liked-card.component';

const PAGE_SIZE = 20;

/**
 * เมนูที่ถูกใจทั้งหมด (/history/liked, ต้อง login) — grid แบ่งหน้าครั้งละ 20, เรียงจากล่าสุด.
 * "ยกเลิกถูกใจ" → ถามยืนยัน → DELETE /api/recipes/{id}/like → โหลดหน้าเดิมใหม่ (หน้าว่างแล้ว → ถอยหนึ่งหน้า)
 */
@Component({
  selector: 'app-liked-recipes',
  standalone: true,
  imports: [NavbarComponent, RouterLink, LikedCardComponent, ConfirmDialogComponent],
  templateUrl: './liked-recipes.component.html',
  styleUrls: ['../history.component.css', './liked-recipes.component.css']
})
export class LikedRecipesComponent implements OnInit, OnDestroy {

  private history = inject(HistoryService);
  private subs = new Subscription();

  data: Page<LikedRecipe> | null = null;
  loading = true;
  loadError = false;

  pending: LikedRecipe | null = null;
  busyId: string | null = null;
  status = '';
  actionError = '';

  ngOnInit(): void {
    this.load(0);
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  load(page: number): void {
    this.loading = true;
    this.loadError = false;
    this.subs.add(this.history.liked(page, PAGE_SIZE).subscribe({
      next: p => {
        if (!p.content.length && p.page > 0) { this.load(p.page - 1); return; }
        this.data = p;
        this.loading = false;
      },
      error: () => { this.loading = false; this.loadError = true; }
    }));
  }

  goPage(p: number): void {
    if (!this.data || p < 0 || p >= this.data.totalPages) return;
    this.status = '';
    this.load(p);
    window.scrollTo({ top: 0 });
  }

  askUnlike(item: LikedRecipe): void {
    this.actionError = '';
    this.pending = item;
  }

  confirmUnlike(): void {
    const item = this.pending;
    this.pending = null;
    if (!item) return;
    this.busyId = item.recipe.id;
    const name = item.displayName || item.recipe.menuName;
    this.subs.add(this.history.unlike(item.recipe.id).subscribe({
      next: () => {
        this.busyId = null;
        this.status = `ยกเลิกถูกใจ "${name}" แล้ว`;
        this.load(this.data?.page ?? 0);
      },
      error: () => {
        this.busyId = null;
        this.actionError = 'ยกเลิกถูกใจไม่สำเร็จ กรุณาลองใหม่';
      }
    }));
  }

  get pendingName(): string {
    return this.pending ? (this.pending.displayName || this.pending.recipe.menuName) : '';
  }
}
