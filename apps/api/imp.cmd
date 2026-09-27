@echo off
set DATABASE_URL=postgresql://servana:servana@localhost:5432/servana
node -e "require('fs').appendFileSync('imp_a.log','start\n'); require('./dist/app.module'); require('fs').appendFileSync('imp_b.log','appmodule-ok\n');"
