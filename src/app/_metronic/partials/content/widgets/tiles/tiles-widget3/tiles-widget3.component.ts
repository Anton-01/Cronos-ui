import { Component, Input } from '@angular/core';

@Component({
    selector: 'app-tiles-widget3',
    templateUrl: './tiles-widget3.component.html',
    standalone: false
})
export class TilesWidget3Component {
  @Input() cssClass = '';
  @Input() widgetHeight = '130px';

  constructor() {}
}
