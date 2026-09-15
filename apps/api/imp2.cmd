@echo off
set DATABASE_URL=postgresql://servana:servana@localhost:5432/servana
node -e "const fs=require('fs'); const log=(m)=>fs.appendFileSync('imp_c.log',m+'\n'); log('start'); log('prisma'); require('./dist/modules/prisma/prisma.module'); log('prisma-ok'); log('redis'); require('./dist/modules/redis/redis.module'); log('redis-ok'); log('queue'); require('./dist/modules/queue/queue.module'); log('queue-ok'); log('auth'); require('./dist/modules/auth/auth.module'); log('auth-ok'); log('done');"
