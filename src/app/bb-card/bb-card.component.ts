import { Component, OnChanges, Input, OnInit, ViewChild, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material';
import 'rxjs/add/observable/concat';
import 'rxjs/add/observable/defer';
import 'rxjs/add/observable/merge';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/concatMap';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/takeWhile';

import { Chart } from 'angular-highcharts';
import { DataPoint } from 'highcharts';
import * as Highcharts from 'highcharts';

import * as moment from 'moment';
import * as _ from 'lodash';

import { OrderPref } from '../shared/enums/order-pref.enum';
import {
  BacktestService,
  DaytradeService,
  ReportingService,
  ScoreKeeperService,
  PortfolioService
} from '../shared';
import { TimerObservable } from 'rxjs/observable/TimerObservable';
import { SmartOrder } from '../shared/models/smart-order';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { Subscription } from 'rxjs/Subscription';

@Component({
  selector: 'app-bb-card',
  templateUrl: './bb-card.component.html',
  styleUrls: ['./bb-card.component.css']
})
export class BbCardComponent implements OnInit, OnChanges {
  @ViewChild('stepper') stepper;
  @Input() order: SmartOrder;
  @Input() triggered: boolean;
  @Input() triggeredBacktest: boolean;
  @Input() init: boolean;
  @Input() stepForward: number;
  @Input() backtestData: number;
  chart: Chart;
  volumeChart: Chart;
  alive: boolean;
  live: boolean;
  interval: number;
  orders: SmartOrder[] = [];
  buyCount: number;
  sellCount: number;
  positionCount: number;
  firstFormGroup: FormGroup;
  secondFormGroup: FormGroup;
  sub: Subscription;
  sides: string[];
  error: string;
  color: string;
  warning: string;
  backtestLive: boolean;
  lastPrice: number;
  preferenceList: any[];
  config;
  showGraph;
  tiles;
  bbandPeriod;
  dataInterval: string;
  myPreferences;
  startTime;
  endTime;
  noonTime;
  backtestQuotes;
  momentum;
  mfi;
  stopped;
  isBacktest;

  constructor(private _formBuilder: FormBuilder,
    private backtestService: BacktestService,
    private daytradeService: DaytradeService,
    private reportingService: ReportingService,
    private scoringService: ScoreKeeperService,
    private portfolioService: PortfolioService,
    public dialog: MatDialog) { }

  ngOnInit() {
    this.alive = true;
    this.interval = 199800;
    this.live = false;
    this.sides = ['Buy', 'Sell', 'DayTrade'];
    this.error = '';
    this.backtestLive = false;
    this.preferenceList = [OrderPref.TakeProfit,
    OrderPref.StopLoss,
    OrderPref.MeanReversion1,
    OrderPref.Mfi,
    OrderPref.SpyMomentum,
    OrderPref.useYahooData
    ];
    Highcharts.setOptions({
      global: {
        useUTC: false
      }
    });
    this.startTime = moment('10:10am', 'h:mma');
    this.noonTime = moment('1:10pm', 'h:mma');
    this.endTime = moment('3:30pm', 'h:mma');
    this.showGraph = false;
    this.bbandPeriod = 80;
    this.dataInterval = '1min';

    this.firstFormGroup = this._formBuilder.group({
      quantity: [this.order.quantity, Validators.required],
      lossThreshold: [this.order.lossThreshold || -0.01, Validators.required],
      profitTarget: [{ value: this.order.profitTarget || 0.01, disabled: false }, Validators.required],
      orderSize: [this.order.orderSize || this.daytradeService.getDefaultOrderSize(this.order.quantity), Validators.required],
      orderType: [this.order.side, Validators.required],
      preferences: []
    });

    this.myPreferences = this.initPreferences();

    this.secondFormGroup = this._formBuilder.group({
      secondCtrl: ['', Validators.required]
    });

    this.setup();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (_.get(changes, 'triggered.currentValue')) {
      this.goLive();
    } else if (_.get(changes, 'backtestData.currentValue')) {
      this.backtest(this.backtestData);
    } else if (_.get(changes, 'triggeredBacktest.currentValue')) {
      this.backtest(this.backtestData);
    } else {
      if (_.get(changes, 'init.currentValue')) {
        this.initRun();
      }

      if (_.get(changes, 'stepForward.currentValue')) {
        this.step();
      }
    }
  }

  resetStepper(stepper) {
    stepper.selectedIndex = 0;
    this.stop();
  }

  progress() {
    return Number((100 * (this.buyCount + this.sellCount / this.firstFormGroup.value.quantity)).toFixed(2));
  }

  openDialog(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '250px',
      data: { title: 'Confirm', message: 'Are you sure you want to execute this order?' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.goLive();
      }
    });
  }

  confirmLiveBacktest(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '250px',
      data: { title: 'Confirm', message: 'Are you sure you want to send real orders in backtest?' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.newRun(false, true);
      }
    });
  }

  backtest(data: any): void {
    this.setup();
    this.isBacktest = true;
    if (data) {
      this.backtestQuotes = data;
      this.newRun(false, false);
    } else {
      this.requestQuotes()
        .then(() => {
          this.newRun(false, false);
        });
    }
  }

  goLive() {
    this.setup();
    this.alive = true;
    this.sub = TimerObservable.create(0, this.interval)
      .takeWhile(() => this.alive)
      .subscribe(() => {
        this.live = true;
        this.play(true, this.backtestLive);
      });
  }

  initRun() {
    this.setup();
    this.alive = true;
    this.live = true;
  }

  step() {
    if (this.alive) {
      this.play(true, this.backtestLive);
    }
  }

  newRun(live, backtestLive) {
    this.setup();
    this.play(live, backtestLive);
  }

  requestQuotes() {
    return this.backtestService.getYahooIntraday(this.order.holding.symbol).toPromise()
      .then((result) => {
        this.backtestQuotes = result;
      });
  }

  async play(live, backtestLive) {
    this.live = live;
    this.backtestLive = backtestLive;

    let data;

    if (live) {
      const requestBody = {
        symbol: this.order.holding.symbol,
        interval: this.dataInterval
      };

      data = this.config.useYahooData ? await this.daytradeService.getIntradayYahoo(this.order.holding.symbol) :
        await this.backtestService.getIntraday2(requestBody).toPromise()
          .then((intraday) => {
            const timestamps = intraday.chart.result[0].timestamp;
            if (timestamps.length > 0) {
              return this.portfolioService.getQuote(this.order.holding.symbol)
                .toPromise()
                .then((quote) => {
                  return this.daytradeService.addQuote(intraday, quote);
                });
            } else {
              return this.daytradeService.getIntradayYahoo(this.order.holding.symbol);
            }
          });

    } else if (this.backtestQuotes.length) {
      data = this.daytradeService.createNewChart();

      _.forEach(this.backtestQuotes, (historicalData) => {
        data = this.daytradeService.addChartData(data, historicalData);
      });
    }

    const dataFound: boolean = _.has(data, 'chart.result[0].timestamp');

    if (dataFound) {
      const volume = [],
        timestamps = _.get(data, 'chart.result[0].timestamp'),
        dataLength = timestamps.length,
        quotes = _.get(data, 'chart.result[0].indicators.quote[0]');

      if (this.live) {
        if (dataLength > this.bbandPeriod) {
          const lastIndex = dataLength - 1;
          const firstIndex = dataLength - this.bbandPeriod;
          this.runStrategy(quotes, timestamps, firstIndex, lastIndex);
        }
      }

      this.chart = this.initPriceChart(this.order.holding.symbol);

      for (let i = 0; i < dataLength; i += 1) {
        const closePrice = quotes.close[i];

        const point: DataPoint = {};

        point.x = moment.unix(timestamps[i]).valueOf(); // the date
        point.y = closePrice; // close

        if (!this.live && i > this.bbandPeriod && !this.stopped) {
          const lastIndex = i;
          const firstIndex = i - this.bbandPeriod;
          const order = await this.runStrategy(quotes, timestamps, firstIndex, lastIndex);

          if (order) {
            if (order.side.toLowerCase() === 'buy') {
              point.marker = {
                symbol: 'triangle',
                fillColor: 'green',
                radius: 5
              };
            } else if (order.side.toLowerCase() === 'sell') {
              point.marker = {
                symbol: 'triangle-down',
                fillColor: 'red',
                radius: 5
              };
            }
          }
        }

        const foundOrder = this.orders.find((order) => {
          return point.x === order.signalTime;
        });

        if (foundOrder) {
          if (foundOrder.side.toLowerCase() === 'buy') {
            point.marker = {
              symbol: 'triangle',
              fillColor: 'green',
              radius: 5
            };
          } else if (foundOrder.side.toLowerCase() === 'sell') {
            point.marker = {
              symbol: 'triangle-down',
              fillColor: 'red',
              radius: 5
            };
          }
        }

        this.chart.addPoint(point);

        volume.push([
          moment.unix(timestamps[i]).valueOf(), // the date
          quotes.volume[i] // the volume
        ]);
      }

      this.tiles = this.daytradeService.buildTileList(this.orders);
      this.volumeChart = this.initVolumeChart(volume);
    }

    // TODO: Use moment timezones
    // if (moment().isAfter(this.endTime)) {
    //   this.reportingService.addAuditLog(this.order.holding.symbol, `Final Orders ${this.order.holding.name}`);

    //   _.forEach(this.tiles, (tile) => {
    //     _.forEach(tile.orders, (order) => {
    //       const orderStr = JSON.stringify(order);
    //       console.log(`Order: ${orderStr}`);
    //       // this.reportingService.addAuditLog(`Order: ${orderStr}`);
    //     });
    //   });

    //   this.stop();
    // }
  }

  initVolumeChart(data): Chart {
    return new Chart({
      chart: {
        type: 'column',
        marginLeft: 40, // Keep all charts left aligned
        marginTop: 0,
        marginBottom: 0,
        width: 800,
        height: 175
      },
      title: {
        text: '',
        style: {
          display: 'none'
        }
      },
      subtitle: {
        text: '',
        style: {
          display: 'none'
        }
      },
      legend: {
        enabled: false
      },
      xAxis: {
        type: 'datetime',
        labels: {
          formatter: function () {
            return moment(this.value).format('hh:mm');
          }
        }
      },
      yAxis: {
        endOnTick: false,
        startOnTick: false,
        labels: {
          enabled: false
        },
        title: {
          text: null
        },
        tickPositions: [0]
      },
      tooltip: {
        crosshairs: true,
        shared: true,
        formatter: function () {
          return moment(this.x).format('hh:mm') + '<br><b>Volume:</b> ' + this.y + '<br>' + this.points[0].key;
        }
      },
      series: [
        {
          name: 'Volume',
          id: 'volume',
          data: data
        }]
    });
  }

  initPriceChart(title): Chart {
    return new Chart({
      chart: {
        type: 'spline',
        marginLeft: 40, // Keep all charts left aligned
        marginTop: 0,
        marginBottom: 0,
        width: 800,
        height: 175
      },
      title: {
        text: '',
        style: {
          display: 'none'
        }
      },
      subtitle: {
        text: '',
        style: {
          display: 'none'
        }
      },
      legend: {
        enabled: false
      },
      xAxis: {
        type: 'datetime',
        dateTimeLabelFormats: {
          second: '%H:%M:%S',
          minute: '%H:%M',
          hour: '%H:%M'
        },
        labels: {
          formatter: function () {
            return moment(this.value).format('hh:mm');
          }
        }
      },
      yAxis: {
        endOnTick: false,
        startOnTick: false,
        labels: {
          enabled: false
        },
        title: {
          text: null
        },
        tickPositions: [0]
      },
      tooltip: {
        crosshairs: true,
        shared: true,
        formatter: function () {
          return moment(this.x).format('hh:mm') + '<br><b>Price:</b> ' + this.y + '<br>' + this.x;
        }
      },
      plotOptions: {
        spline: {
          marker: {
            radius: 1,
            lineColor: '#666666',
            lineWidth: 1
          }
        },
        series: {
          marker: {
            enabled: true
          }
        }
      },
      series: [{
        name: title,
        id: title,
        data: []
      }]
    });
  }

  stop() {
    this.alive = false;
    this.live = false;
    this.stopped = true;
    this.backtestLive = false;
    if (this.sub) {
      this.sub.unsubscribe();
    }
  }

  setup() {
    this.buyCount = 0;
    this.sellCount = 0;
    this.positionCount = 0;
    this.orders = [];
    this.config = this.daytradeService.parsePreferences(this.firstFormGroup.value.preferences);
    this.warning = '';
    this.stopped = false;
    this.scoringService.resetScore(this.order.holding.symbol);

    switch (this.firstFormGroup.value.orderType.side) {
      case 'Buy':
        this.color = 'primary';
        break;
      case 'Sell':
        this.color = 'warn';
        break;
      default:
        this.color = 'accent';
    }
  }

  incrementBuy(order) {
    this.orders.push(order);
    this.buyCount += order.quantity;
    this.positionCount += order.quantity;
    this.order.positionCount = this.positionCount;
  }

  incrementSell(order) {
    this.orders.push(order);
    this.sellCount += order.quantity;
    this.positionCount -= order.quantity;
    this.order.positionCount = this.positionCount;
  }

  sendBuy(buyOrder: SmartOrder) {
    if (buyOrder) {
      const log = `ORDER SENT ${moment(buyOrder.signalTime).format('hh:mm')} ${buyOrder.side} ${buyOrder.holding.symbol} ${buyOrder.quantity} ${buyOrder.price}`;

      if (this.backtestLive || this.live) {
        const resolve = (response) => {
          this.incrementBuy(buyOrder);

          console.log(`${moment().format('hh:mm')} ${log}`);
          this.reportingService.addAuditLog(this.order.holding.symbol, log);
        };

        const reject = (error) => {
          this.error = error._body;
          if (error.status !== 400) {
            this.stop();
          }
        };
        this.daytradeService.sendBuy(buyOrder, 'market', resolve, reject);
      } else {
        this.incrementBuy(buyOrder);
        console.log(`${moment().format('hh:mm')} ${log}`);
        this.reportingService.addAuditLog(this.order.holding.symbol, log);
      }
    }
    return buyOrder;
  }

  sendSell(sellOrder: SmartOrder) {
    if (sellOrder) {
      const log = `ORDER SENT ${sellOrder.side} ${sellOrder.holding.symbol} ${sellOrder.quantity} ${sellOrder.price}`;
      if (this.backtestLive || this.live) {
        const resolve = (response) => {
          this.incrementSell(sellOrder);

          if (this.order.side.toLowerCase() !== 'sell') {
            const pl = this.daytradeService.estimateSellProfitLoss(this.orders);
            this.scoringService.addProfitLoss(this.order.holding.symbol, pl);
          }

          console.log(`${moment().format('hh:mm')} ${log}`);
          this.reportingService.addAuditLog(this.order.holding.symbol, log);
        };

        const reject = (error) => {
          this.error = error._body;
          if (error.status !== 400) {
            this.stop();
          }
        };

        const handleNotFound = () => {
          this.removeOrder(sellOrder);
          this.setWarning(`Trying to sell ${sellOrder.holding.symbol} position that doesn\'t exists`);
        };

        this.daytradeService.sendSell(sellOrder, 'market', resolve, reject, handleNotFound);

      } else {
        this.incrementSell(sellOrder);

        const pl = this.daytradeService.estimateSellProfitLoss(this.orders);
        if (this.order.side.toLowerCase() !== 'sell') {
          this.scoringService.addProfitLoss(this.order.holding.symbol, pl);
        }

        console.log(`${moment().format('hh:mm')} ${log}`);
        this.reportingService.addAuditLog(this.order.holding.symbol, log);
      }
    }
    return sellOrder;
  }

  sendStopLoss(order: SmartOrder) {
    if (order) {
      const log = `MARKET ORDER SENT ${order.side} ${order.holding.symbol} ${order.quantity} ${order.price}`;
      if (this.backtestLive || this.live) {

        const resolve = (response) => {
          this.incrementSell(order);

          if (this.order.side.toLowerCase() !== 'sell') {
            const pl = this.daytradeService.estimateSellProfitLoss(this.orders);
            this.scoringService.addProfitLoss(this.order.holding.symbol, pl);
          }

          console.log(`${moment().format('hh:mm')} ${log}`);
          this.reportingService.addAuditLog(this.order.holding.symbol, log);
        };

        const reject = (error) => {
          this.error = error._body;
          this.stop();
        };

        const handleNotFound = () => {
          this.removeOrder(order);
          this.setWarning(`Trying to sell ${order.holding.symbol} position that doesn\'t exists`);
        };


        this.daytradeService.sendSell(order, 'market', resolve, reject, handleNotFound);
      } else {
        this.incrementSell(order);

        if (this.order.side.toLowerCase() !== 'sell') {
          const pl = this.daytradeService.estimateSellProfitLoss(this.orders);
          this.scoringService.addProfitLoss(this.order.holding.symbol, pl);
        }
        console.log(`${moment().format('hh:mm')} ${log}`);
        this.reportingService.addAuditLog(this.order.holding.symbol, log);
      }
    }
    return order;
  }

  async buildOrder(quotes,
    timestamps,
    idx,
    band: any[],
    shortSma: any[],
    roc: any[],
    roc5: any[]) {

    if (band.length !== 3) {
      return null;
    }

    const specialOrder = this.processSpecialRules(quotes.close[idx], timestamps[idx]);

    if (specialOrder) {
      return specialOrder;
    }

    const lastTimestamp = timestamps[idx];
    const timePeriod = this.daytradeService.tradePeriod(moment.unix(lastTimestamp), this.startTime, this.noonTime, this.endTime);

    if (timePeriod === 'pre' || timePeriod === 'after') {
      return null;
    }

    if (this.firstFormGroup.value.orderType.toLowerCase() === 'buy') {
      const orderQuantity = this.daytradeService.getBuyOrderQuantity(this.firstFormGroup.value.quantity,
        this.firstFormGroup.value.orderSize,
        this.buyCount,
        this.positionCount);

      if (orderQuantity <= 0) {
        return null;
      }

      const buyOrder = await this.buildBuyOrder(orderQuantity,
        quotes.close[idx],
        timestamps[idx],
        quotes.low[idx] || quotes.close[idx],
        quotes,
        idx,
        band,
        shortSma,
        roc);

      return this.sendBuy(buyOrder);
    } else if (this.firstFormGroup.value.orderType.toLowerCase() === 'sell') {
      const orderQuantity = this.daytradeService.getOrderQuantity(this.firstFormGroup.value.quantity,
        this.firstFormGroup.value.orderSize,
        this.sellCount);

      if (orderQuantity <= 0) {
        return null;
      }

      const sellOrder = this.buildSellOrder(orderQuantity,
        quotes.close[idx],
        timestamps[idx],
        quotes.high[idx] || quotes.close[idx],
        quotes,
        idx,
        band,
        shortSma,
        roc);

      return this.sendSell(sellOrder);
    } else if (this.firstFormGroup.value.orderType.toLowerCase() === 'daytrade') {
      if (this.hasReachedDayTradeOrderLimit()) {
        this.stop();
        return null;
      }
      const sellQuantity: number = this.positionCount;

      const sell: SmartOrder = sellQuantity <= 0 ? null :
        this.buildSellOrder(sellQuantity,
          quotes.close[idx],
          timestamps[idx],
          quotes.high[idx] || quotes.close[idx],
          quotes,
          idx,
          band,
          shortSma,
          roc5);

      if (sell && this.buyCount >= this.sellCount) {
        return this.sendStopLoss(sell);
      }

      if (!sell) {
        const buyQuantity: number = this.daytradeService.getBuyOrderQuantity(this.firstFormGroup.value.quantity,
          this.firstFormGroup.value.orderSize,
          this.buyCount,
          this.positionCount);

        const buy: SmartOrder = buyQuantity <= 0 ? null :
          await this.buildBuyOrder(buyQuantity, quotes.close[idx], timestamps[idx],
            quotes.low[idx] || quotes.close[idx], quotes, idx, band, shortSma, roc);

        if (buy) {
          return this.sendBuy(buy);
        }
      }
      return null;
    }
  }

  async buildBuyOrder(orderQuantity: number,
    price,
    signalTime,
    signalPrice,
    quotes,
    idx: number,
    band: any[],
    shortSma: any[],
    roc: any[]) {

    const high = band[2],
      // mid = band[1],
      low = band[0];

    const pricePaid = this.daytradeService.estimateAverageBuyOrderPrice(this.orders);
    const gains = this.daytradeService.getPercentChange(signalPrice, pricePaid);

    if (gains < this.firstFormGroup.value.lossThreshold) {
      this.setWarning('Loss threshold met. Buying is stalled. Estimated loss: ' +
        `${this.daytradeService.convertToFixedNumber(gains, 4) * 100}%`);
      this.reportingService.addAuditLog(this.order.holding.symbol,
        `Loss circuit breaker triggered. Current: ${signalPrice}, Paid: ${pricePaid}, Gains: ${gains}`);
      return null;
    }

    if (orderQuantity <= 0) {
      return null;
    }

    if (!signalPrice || !price) {
      return null;
    }

    if (this.config.Mfi) {
      if (this.daytradeService.isOversoldBullish(roc, this.momentum, this.mfi)) {
        const log = `${this.order.holding.symbol} mfi oversold Event - time: ${moment.unix(signalTime).format()}, short rate of change: ${roc}, long rate of change: ${this.momentum}, mfi: ${this.mfi}`;

        this.reportingService.addAuditLog(this.order.holding.symbol, log);
        console.log(log);
        return this.daytradeService.createOrder(this.order.holding, 'Buy', orderQuantity, price, signalTime);
      }
    }
    if (this.config.SpyMomentum) {
      if (this.daytradeService.isMomentumBullish(signalPrice, high[0], this.mfi)) {
        const log = `${this.order.holding.symbol} bb momentum Event - time: ${moment.unix(signalTime).format()}, bband high: ${high[0]}, mfi: ${this.mfi}`;

        this.reportingService.addAuditLog(this.order.holding.symbol, log);
        console.log(log);
        return this.daytradeService.createOrder(this.order.holding, 'Buy', orderQuantity, price, signalTime);
      }
    }

    if (this.config.MeanReversion1) {
      if (this.daytradeService.isBBandMeanReversionBullish(signalPrice, low[0], this.mfi, roc, this.momentum)) {
        const log = `${this.order.holding.symbol} bb mean reversion Event - time: ${moment.unix(signalTime).format()}, bband low: ${low[0]}, mfi: ${this.mfi}`;

        this.reportingService.addAuditLog(this.order.holding.symbol, log);
        console.log(log);
        return this.daytradeService.createOrder(this.order.holding, 'Buy', orderQuantity, price, signalTime);
      }
    }
    return null;
  }

  buildSellOrder(orderQuantity: number, price, signalTime, signalPrice, quotes, idx: number, band: any[], shortSma: any[], roc: any[]) {
    const upper = band[2],
      mid = band[1],
      lower = band[0];

    if (orderQuantity <= 0) {
      return null;
    }

    if (!signalPrice || !price) {
      return null;
    }

    const rocLen = roc[0].length - 1;
    const roc1 = _.round(roc[0][rocLen], 3);
    const num = this.momentum,
      den = roc1;

    const momentumDiff = _.round(_.divide(num, den), 3);
    const rocDiffRange = [0, 3];

    if (momentumDiff < rocDiffRange[0] || momentumDiff > rocDiffRange[1]) {
      if (signalPrice > upper[0] && (this.mfi > 46)) {
        const log = `BB Sell Event - time: ${moment.unix(signalTime).format()}, price: ${signalPrice}, roc: ${roc1}, mid: ${mid[0]}, lower: ${lower[0]}`;
        this.reportingService.addAuditLog(this.order.holding.symbol, log);

        console.log(log);

        return this.daytradeService.createOrder(this.order.holding, 'Sell', orderQuantity, price, signalTime);
      } else if (this.mfi > 80) {
        const log = `mfi Sell Event - time: ${moment.unix(signalTime).format()}, price: ${signalPrice}, roc: ${roc1}`;

        this.reportingService.addAuditLog(this.order.holding.symbol, log);

        console.log(log);

        return this.daytradeService.createOrder(this.order.holding, 'Sell', orderQuantity, price, signalTime);
      }
    }

    return null;
  }

  processSpecialRules(closePrice: number, signalTime) {
    const score = this.scoringService.getScore(this.order.holding.symbol);
    if (score && score.total > 2) {
      const scorePct = _.round(_.divide(score.wins, score.total), 2);
      if (scorePct < 0.35) {
        if (!this.isBacktest) {
          this.stop();
        }
        const msg = 'Too many losses. Halting trading in Wins:' +
          `${this.order.holding.symbol} ${score.wins} Loss: ${score.losses}`;

        this.reportingService.addAuditLog(this.order.holding.symbol, msg);
        console.log(msg);
        if (this.isBacktest) {
          console.log('Trading not halted in backtest mode.');
        }
      }
    }
    if (this.positionCount > 0 && closePrice) {
      const estimatedPrice = this.daytradeService.estimateAverageBuyOrderPrice(this.orders);
      const gains = this.daytradeService.getPercentChange(closePrice, estimatedPrice);

      if (this.config.StopLoss) {
        if (gains < this.firstFormGroup.value.lossThreshold) {
          this.setWarning('Loss threshold met. Sending stop loss order. Estimated loss: ' +
            `${this.daytradeService.convertToFixedNumber(gains, 4) * 100}%`);
          const log = `${this.order.holding.symbol} Stop Loss triggered: ${closePrice}/${estimatedPrice}`;
          this.reportingService.addAuditLog(this.order.holding.symbol, log);
          console.log(log);
          const stopLossOrder = this.daytradeService.createOrder(this.order.holding, 'Sell', this.positionCount, closePrice, signalTime);
          return this.sendStopLoss(stopLossOrder);
        }
      }

      if (this.config.TakeProfit) {
        if (gains > this.firstFormGroup.value.profitTarget) {
          const warning = `Profits met. Realizing profits. Estimated gain: ${this.daytradeService.convertToFixedNumber(gains, 4) * 100}%`;
          this.setWarning(warning);
          this.reportingService.addAuditLog(this.order.holding.symbol,
            `${this.order.holding.symbol} PROFIT HARVEST TRIGGERED: ${closePrice}/${estimatedPrice}`);
          console.log(warning);
          const sellOrder = this.daytradeService.createOrder(this.order.holding, 'Sell', this.positionCount, closePrice, signalTime);
          return this.sendSell(sellOrder);
        }
      }
    }
    return null;
  }

  removeOrder(oldOrder) {
    const orderToBeRemoved = this.orders.findIndex((o) => {
      return oldOrder.signalTime === o.signalTime;
    });

    if (orderToBeRemoved > -1) {
      this.orders.splice(orderToBeRemoved, 1);
    }
    if (oldOrder.side.toLowerCase() === 'sell') {
      this.sellCount -= oldOrder.quantity;
      this.positionCount += oldOrder.quantity;
    } else if (oldOrder.side.toLowerCase() === 'buy') {
      this.buyCount -= oldOrder.quantity;
      this.positionCount -= oldOrder.quantity;
    }
  }

  async runStrategy(quotes, timestamps, firstIdx, lastIdx) {
    const { firstIndex, lastIndex } = this.daytradeService.findMostCurrentQuoteIndex(quotes.close, firstIdx, lastIdx);
    const reals = quotes.close.slice(firstIndex, lastIndex + 1);
    const highs = quotes.high.slice(firstIndex, lastIndex + 1);
    const lows = quotes.low.slice(firstIndex, lastIndex + 1);
    const volumes = quotes.volume.slice(firstIndex, lastIndex + 1);
    if (!quotes.close[lastIndex]) {
      // const log = `Quote data is missing ${reals.toString()}`;
      // this.reportingService.addAuditLog(this.order.holding.symbol, log);
      return null;
    }
    const band = await this.daytradeService.getBBand(reals, this.bbandPeriod);
    // const shortSma = await this.daytradeService.getSMA(reals, 5);
    const shortSma = null;

    const roc = await this.daytradeService.getROC(_.slice(reals, reals.length - 11), 10);
    this.momentum = await this.daytradeService.getROC(reals, 70)
      .then((result) => {
        const rocLen = result[0].length - 1;
        const roc1 = _.round(result[0][rocLen], 3);
        return _.round(roc1, 3);
      });

    const roc5 = this.positionCount > 0 ? await this.daytradeService.getROC(this.daytradeService.getSubArray(reals, 5), 5) : [];

    this.mfi = await this.daytradeService.getMFI(this.daytradeService.getSubArray(highs, 14),
      this.daytradeService.getSubArray(lows, 14),
      this.daytradeService.getSubArray(reals, 14),
      this.daytradeService.getSubArray(volumes, 14),
      14)
      .then((result) => {
        const len = result[0].length - 1;
        return _.round(result[0][len], 3);
      });

    return this.buildOrder(quotes, timestamps, lastIndex, band, shortSma, roc, roc5);
  }

  hasReachedDayTradeOrderLimit() {
    return (this.buyCount >= this.firstFormGroup.value.quantity) &&
      (this.sellCount >= this.firstFormGroup.value.quantity);
  }

  setWarning(message) {
    this.warning = message;
    this.reportingService.addAuditLog(this.order.holding.symbol, `${this.order.holding.symbol} - ${message}`);
  }

  initPreferences() {
    const pref = [];
    if (this.order.useTakeProfit) {
      pref.push(OrderPref.TakeProfit);
    }

    if (this.order.useStopLoss) {
      pref.push(OrderPref.StopLoss);
    }

    if (this.order.meanReversion1) {
      pref.push(OrderPref.MeanReversion1);
    }

    if (this.order.useMfi) {
      pref.push(OrderPref.Mfi);
    }

    if (this.order.spyMomentum) {
      pref.push(OrderPref.SpyMomentum);
    }

    if (this.order.yahooData) {
      pref.push(OrderPref.useYahooData);
    }
    return pref;
  }
}
