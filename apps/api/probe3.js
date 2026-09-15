const fs = require('fs');
const log = (m) => fs.appendFileSync('probe3.log', m + '\n');
log('start ' + new Date().toISOString());
try {
  log('REQ app.module');
  require('./dist/app.module');
  log('OK app.module');
} catch (e) {
  log('ERR app.module ' + (e && e.stack ? e.stack : e));
}
log('ALL ' + new Date().toISOString());
