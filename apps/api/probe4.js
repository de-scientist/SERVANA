const fs = require('fs');
const log = (m) => fs.appendFileSync('probe4.log', m + '\n');
const step = (n, p) => {
  log('REQ ' + n);
  require(p);
  log('OK ' + n);
};
log('start');
try { step('ConfigModule', '@nestjs/config'); } catch (e) { log('ERR ' + e); }
try { step('PrismaModule', './dist/modules/prisma/prisma.module'); } catch (e) { log('ERR ' + e); }
try { step('RedisModule', './dist/modules/redis/redis.module'); } catch (e) { log('ERR ' + e); }
try { step('QueueModule', './dist/modules/queue/queue.module'); } catch (e) { log('ERR ' + e); }
try { step('HealthModule', './dist/modules/health/health.module'); } catch (e) { log('ERR ' + e); }
try { step('UsersModule', './dist/modules/users/users.module'); } catch (e) { log('ERR ' + e); }
try { step('AuthModule', './dist/modules/auth/auth.module'); } catch (e) { log('ERR ' + e); }
try { step('PaymentModule', './dist/common/adapters/payment/payment.module'); } catch (e) { log('ERR ' + e); }
try { step('AiModule', './dist/common/adapters/ai/ai.module'); } catch (e) { log('ERR ' + e); }
try { step('NotificationModule', './dist/common/adapters/notification/notification.module'); } catch (e) { log('ERR ' + e); }
try { step('StorageModule', './dist/common/adapters/storage/storage.module'); } catch (e) { log('ERR ' + e); }
log('ALL-MODULES');
