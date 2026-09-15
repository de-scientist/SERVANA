const fs = require('fs');
const log = (m) => fs.appendFileSync('probe.log', m + '\n');
const tryReq = (n, p) => {
  try {
    log('REQ ' + n);
    require(p);
    log('OK ' + n);
  } catch (e) {
    log('ERR ' + n + ': ' + (e && e.stack ? e.stack : e));
    process.exit(1);
  }
};
log('start');
tryReq('prisma', './dist/modules/prisma/prisma.module');
tryReq('redis', './dist/modules/redis/redis.module');
tryReq('queue', './dist/modules/queue/queue.module');
tryReq('users', './dist/modules/users/users.module');
tryReq('auth', './dist/modules/auth/auth.module');
tryReq('health', './dist/modules/health/health.module');
tryReq('payment', './dist/common/adapters/payment/payment.module');
tryReq('ai', './dist/common/adapters/ai/ai.module');
tryReq('notification', './dist/common/adapters/notification/notification.module');
tryReq('storage', './dist/common/adapters/storage/storage.module');
tryReq('app', './dist/app.module');
log('ALL-OK');
