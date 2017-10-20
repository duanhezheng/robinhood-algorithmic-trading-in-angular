import { Component, OnInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { DataSource } from '@angular/cdk/collections';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/of';
import 'rxjs/add/observable/merge';

import { BacktestService, Stock, AlgoParam } from '../shared';

@Component({
  selector: 'app-rh-table',
  templateUrl: './rh-table.component.html',
  styleUrls: ['./rh-table.component.css']
})
export class RhTableComponent implements OnInit, OnChanges {
  @Input() data: AlgoParam[];
  @Input() displayedColumns: string[];
  private stockList: Stock[] = [];
  rhDatabase = new RhDatabase();
  dataSource: RhDataSource | null;
  actionable: boolean = true;
  recommendation: string = 'buy';

  constructor(private algo: BacktestService) { }

  ngOnInit() {
    this.dataSource = new RhDataSource(this.rhDatabase);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.data) {
      this.getData(changes.data.currentValue);
    }
  }

  getData(algoParam) {
    algoParam.forEach((param) => {
      this.algo.postMeanReversion(param).subscribe((stockData) => {
        stockData.stock = param.ticker;
        stockData.totalReturns = +((stockData.totalReturns*100).toFixed(2));
        this.rhDatabase.addStock(stockData);
      });
    });
  }
}


export class RhDatabase {
  dataChange: BehaviorSubject<Stock[]> = new BehaviorSubject<Stock[]>([]);
  get data(): Stock[] { return this.dataChange.value; }

  constructor() {}

  addStock(stock: Stock) {
    const copiedData = this.data.slice();
    copiedData.push(stock);
    this.dataChange.next(copiedData);
  }
}

export class RhDataSource extends DataSource<any> {
  _filterChange = new BehaviorSubject('');
  get filter(): string { return this._filterChange.value; }
  set filter(filter: string) { this._filterChange.next(filter); }

  constructor(private _rhDatabase: RhDatabase) {
    super();
  }

  connect(): Observable<Stock[]> {
    const displayDataChanges = [
      this._rhDatabase.dataChange,
      this._filterChange,
    ];

    return Observable.merge(...displayDataChanges).map(() => {
      return this._rhDatabase.data.slice().filter((item: Stock) => {
        let searchStr = (item.stock).toLowerCase();
        return searchStr.indexOf(this.filter.toLowerCase()) != -1;
      });
    });
  }

  disconnect() {}
}
