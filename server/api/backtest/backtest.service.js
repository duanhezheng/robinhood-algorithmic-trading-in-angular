import moment from 'moment';
import json2csv from 'json2csv';
import fs from 'fs';

import { QuoteService } from './../quote/quote.service';
import { ReversionService } from './../mean-reversion/reversion.service';
import * as DecisionService from './../mean-reversion/reversion-decision.service';

import * as errors from '../../components/errors/baseErrors';
import * as tulind from 'tulind';

const config = {
  shortTerm: [3, 85],
  longTerm: [5, 85]
}

let startTime;
let endTime;

class BacktestService {
  getIndicator() {
    console.log("Tulip Indicators version is:");
    console.log(tulind.version);
    var open = [4, 5, 5, 5, 4, 4, 4, 6, 6, 6];
    var high = [9, 7, 8, 7, 8, 8, 7, 7, 8, 7];
    var low = [1, 2, 3, 3, 2, 1, 2, 2, 2, 3];
    var close = [4, 5, 6, 6, 6, 5, 5, 5, 6, 4];
    var volume = [123, 232, 212, 232, 111, 232, 212, 321, 232, 321];
    return tulind.indicators;
  }

  evaluateStrategyAll(ticker, end, start) {
    console.log('Executing: ', ticker, new Date());
    startTime = moment();
    return this.runTest(ticker, end, start);
  }

  getDateRanges(currentDate, startDate) {
    let current = moment(currentDate),
      start = moment(startDate);

    let days = current.diff(start, 'days') + 1;

    return {
      end: current.format(),
      start: start.subtract(this.getTradeDays(days), 'days').format()
    };
  }

  getData(ticker, currentDate, startDate) {
    let { end, start } = this.getDateRanges(currentDate, startDate);
    console.log(start, " to ", end);

    return QuoteService.getDailyQuotes(ticker, end, start)
      .then(data => {
        return data;
      });
  }

  runTest(ticker, currentDate, startDate) {
    let shortTerm = config.shortTerm;
    let longTerm = config.longTerm;
    let snapshots = [];
    return this.getData(ticker, currentDate, startDate)
      .then(quotes => {
        for (let i = shortTerm[0]; i < shortTerm[1]; i++) {
          for (let j = longTerm[0]; j < longTerm[1]; j++) {
            if (i < j) {
              console.log("short:", i, " long:", j);
              let MAs = ReversionService.executeMeanReversion(ReversionService.calcMA, quotes, i, j);
              let yesterdayDecision = MAs[MAs.length - 1];
              let recommendedDifference = DecisionService.findDeviation(MAs, startDate);

              let averagesRange = { shortTerm: i, longTerm: j };
              let returns = DecisionService.calcReturns(MAs, recommendedDifference, startDate);
              console.log("returns: ", returns.totalReturns, "trades: ", returns.totalTrades);

              snapshots.push({ ...averagesRange, ...returns, recommendedDifference });

              if (i % 3 === 0 && j === longTerm[longTerm.length - 1] - 1) {
                fs.writeFile(`${ticker}_analysis_${startDate}-${currentDate}_${i}.csv`, json2csv({ data: snapshots, fields: fields }), function (err) {
                  if (err) throw err;
                  console.log('file saved');
                });
                snapshots.length = 0;
              }
            }
          }
        }
        console.log('Calculations done: ', ticker, new Date());
        endTime = moment();

        const duration = moment.duration(endTime.diff(startTime)).humanize();

        console.log("Duration: ", duration);

        const fields = ['shortTerm', 'longTerm', 'totalReturns', 'totalTrades', 'recommendedDifference'];


        fs.writeFile(`${ticker}_analysis_${currentDate}-${startDate}.csv`, json2csv({ data: snapshots, fields: fields }), function (err) {
          if (err) throw err;
          console.log('file saved');
        });
        return snapshots;
      });
  }

  getMeanReversionChart(ticker, currentDate, startDate, deviation, shortTerm, longTerm) {
    return this.getData(ticker, currentDate, startDate)
      .then(quotes => {
        return ReversionService.executeMeanReversion(ReversionService.calcMA, quotes, shortTerm, longTerm);
      })
      .catch(err => {
        console.log('ERROR! backtest', err);
        throw errors.InvalidArgumentsError();
      });
  }

  getTradeDays(days) {
    let workDaysPerWeek = 5 / 7,
      holidays = 9;

    return Math.ceil(days * workDaysPerWeek - holidays);
  }

}

module.exports.BacktestService = new BacktestService();