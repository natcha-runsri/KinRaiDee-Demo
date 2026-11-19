import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { KinraiComponent } from './kinrai.component';

describe('KinraiComponent', () => {
  let component: KinraiComponent;
  let fixture: ComponentFixture<KinraiComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KinraiComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(KinraiComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
