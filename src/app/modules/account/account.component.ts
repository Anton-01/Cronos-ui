import { Component, OnInit, inject } from '@angular/core';
import {ProfileStateService} from "../../core/services/profile/ProfileStateService";

@Component({
  selector: 'app-account',
  templateUrl: './account.component.html',
})
export class AccountComponent implements OnInit {
  private profileState = inject(ProfileStateService);

  ngOnInit(): void {
    this.profileState.loadProfile();
  }
}
