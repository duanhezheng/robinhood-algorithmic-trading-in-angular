import * as express from 'express';
import * as compression from 'compression';  // compresses requests
import * as bodyParser from 'body-parser';
import * as lusca from 'lusca';
import * as path from 'path';

import * as quote from './api/quote';
import * as meanReversion from './api/mean-reversion';
import * as backtest from './api/backtest';
import * as portfolio from './api/portfolio';

import configurations from './config/environment';

// Create Express server
const app = express();
const env = app.get('env');

// Express configuration
app.set('port', process.env.PORT || 9000);
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'pug');
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(lusca.xframe('SAMEORIGIN'));
app.use(lusca.xssProtection(true));

app.use(
  express.static(path.join(__dirname, 'public'), { maxAge: 31557600000 })
);

if ('production' === env) {
  app.use(express.static(path.join(configurations.root, 'dist')));
  app.set('appPath', 'dist');
}

if ('development' === env || 'test' === env) {
  app.use(express.static(path.join(configurations.root, '.tmp')));
  app.use(express.static(path.join(configurations.root, 'dist')));
  app.set('appPath', 'dist');
}

app.use('/api/quote', quote);
app.use('/api/mean-reversion', meanReversion);
app.use('/api/backtest', backtest);
app.use('/api/portfolio', portfolio);

app.route('/*')
  .get(function(req, res) {
    res.sendfile(app.get('appPath') + '/index.html');
});

export default app;
