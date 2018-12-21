/**
 * Express configuration
 */
import * as express from 'express';
const morgan = require('morgan');
const compression = require('compression');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
const errorHandler = require('errorhandler');
import * as path from 'path';
import configuations from './environment';


module.exports = function(app) {
  const env = app.get('env');

  app.set('views', configuations.root + '/server/views');
  app.set('view engine', 'html');
  app.use(compression());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  app.use(methodOverride());
  app.use(cookieParser());

  if ('production' === env) {
    app.use(express.static(path.join(configuations.root, 'dist')));
    app.set('appPath', 'dist');
    app.use(morgan('dev'));
    app.use(errorHandler()); // Error handler - has to be last
  }

  if ('development' === env || 'test' === env) {
    app.use(express.static(path.join(configuations.root, '.tmp')));
    app.use(express.static(path.join(configuations.root, 'dist')));
    app.set('appPath', 'dist');
    app.use(morgan('dev'));
    app.use(errorHandler()); // Error handler - has to be last
  }
};
