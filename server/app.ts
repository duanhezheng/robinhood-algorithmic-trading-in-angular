/**
 * Main application file
 */

'use strict';

// Set default node environment to development
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
  // application specific logging, throwing an error, or other logic here
});

const express = require('express');

import configurations from './config/environment/index';

// Setup server
const app = express();

app.set('views', __dirname + '/modules');
app.set('view engine', 'html');

const server = require('http').createServer(app);
require('./config/express')(app);
require('./routes')(app);

// Start server

server.listen(configurations.configurations, config.ip, function () {
  console.log('Express server listening on %d, in %s mode', config.port, app.get('env'));
});

// Expose app
exports = module.exports = app;
