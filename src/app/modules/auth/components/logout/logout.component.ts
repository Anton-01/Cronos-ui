import { Component, OnInit } from '@angular/core';
import { AuthService as CronosAuthService } from 'src/app/core/services/auth.service';

@Component({
    selector: 'app-logout',
    templateUrl: './logout.component.html',
    styleUrls: ['./logout.component.scss'],
    standalone: false
})
export class LogoutComponent implements OnInit {
  constructor(private cronosAuth: CronosAuthService) {
    this.cronosAuth.performLogout();
  }

  ngOnInit(): void {}
}
