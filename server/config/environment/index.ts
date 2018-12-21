import * as path from 'path';
import * as _ from 'lodash';

import * as credentials from './credentials';
const all = {
    env: process.env.NODE_ENV,
    root: path.normalize(__dirname + '/../../..'),
    port: process.env.PORT || 9000,
    yahoo: {
        key: _.get(credentials, 'yahoo.key', null),
        secret: _.get(credentials, 'yahoo.secret', null)
    },
    alpha: {
        key: _.get(credentials, 'alpha.key', null)
    }
    apps: {
        goliath: 'http://localhost:8100/'
    }
};
// Export the config object based on the NODE_ENV
// ==============================================
const configuations = _.merge(
    all,
    require('./' + process.env.NODE_ENV + '.js') || {});

  export default configuations;

