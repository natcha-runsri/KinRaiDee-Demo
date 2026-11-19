import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

interface Dish {
  imageUrl: string;
  alt: string;
}

@Component({
  selector: 'app-kinrai',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kinrai.component.html',
  styleUrls: ['./kinrai.component.css']
})
export class KinraiComponent {

  // แถวบน 
  rowTop: Dish[] = [
    { imageUrl: 'images/banner/b1.png', alt: 'Dish 1' },
    { imageUrl: 'images/banner/b2.png', alt: 'Dish 2' },
    { imageUrl: 'images/banner/b3.png', alt: 'Dish 3' },
    { imageUrl: 'images/banner/b4.webp', alt: 'Dish 4' },
    { imageUrl: 'images/banner/b5.png', alt: 'Dish 5' },
    { imageUrl: 'images/banner/b6.png', alt: 'Dish 6' },
  ];

  // แถวล่าง 
  rowBottom: Dish[] = [
    { imageUrl: 'images/banner/b7.png', alt: 'Dish 7' },
    { imageUrl: 'images/banner/b8.png', alt: 'Dish 8' },
    { imageUrl: 'images/banner/b9.png', alt: 'Dish 9' },
    { imageUrl: 'images/banner/b10.png', alt: 'Dish 10' },
    { imageUrl: 'images/banner/b11.webp', alt: 'Dish 11' },
    { imageUrl: 'images/banner/b12.webp', alt: 'Dish 12' },
  ];

  constructor(private router: Router) { }

  goToHome(): void {
    void this.router.navigate(['/home']);
  }
}