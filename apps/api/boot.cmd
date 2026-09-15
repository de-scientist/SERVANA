@echo off
set DATABASE_URL=postgresql://servana:servana@localhost:5432/servana
set JWT_ACCESS_SECRET=test
set JWT_REFRESH_SECRET=test
set API_PORT=3001
set CORS_ORIGINS=http://localhost:3000
node dist/main.js > boot5.out 2>&1
