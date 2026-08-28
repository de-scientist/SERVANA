@echo off
set DATABASE_URL=postgresql://servana:servana@localhost:5432/servana
set REDIS_URL=
set JWT_ACCESS_SECRET=test
set JWT_REFRESH_SECRET=test
set API_PORT=3001
set CORS_ORIGINS=http://localhost:3000
set BOOT_VERIFY=1
cd /d E:\SERVANA\apps\api
node dist/main.js > E:\SERVANA\verify.log 2>&1
