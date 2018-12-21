/**
 * Main application routes
 */
import * as quote from './api/quote';
import * as meanReversion from './api/mean-reversion';
import * as backtest from './api/backtest';
import * as portfolio from './api/portfolio';

module.exports = function(app) {
  // Insert routes below
  app.use('/api/quote', quote);
  app.use('/api/mean-reversion', meanReversion);
  app.use('/api/backtest', backtest);
  app.use('/api/portfolio', portfolio);

  app.route('/*')
    .get(function(req, res) {
        res.sendfile(app.get('appPath') + '/index.html');
  });
};
