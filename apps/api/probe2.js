const fs = require('fs');
const log = (m) => fs.appendFileSync('probe2.log', m + '\n');
log('start');
try { log('ioredis'); require('ioredis'); log('ioredis-ok'); } catch (e) { log('ioredis-ERR ' + e); }
try { log('bullmq'); require('bullmq'); log('bullmq-ok'); } catch (e) { log('bullmq-ERR ' + e); }
try { log('prisma'); require('@prisma/client'); log('prisma-ok'); } catch (e) { log('prisma-ERR ' + e); }
log('ALL');
