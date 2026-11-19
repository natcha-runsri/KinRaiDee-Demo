import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ReccommendComponent } from './reccommend.component';

describe('ReccommendComponent', () => {
  let component: ReccommendComponent;
  let fixture: ComponentFixture<ReccommendComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReccommendComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReccommendComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
