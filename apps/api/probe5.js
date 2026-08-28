const fs = require('fs');
const log = (m) => fs.appendFileSync('probe5.log', m + '\n');
const step = (n, p) => { log('REQ ' + n); require(p); log('OK ' + n); };
log('start');
try { step('@nestjs/jwt', '@nestjs/jwt'); } catch (e) { log('ERR ' + e); }
try { step('auth.dto', './dist/modules/auth/dto/auth.dto'); } catch (e) { log('ERR ' + e); }
try { step('jwt-auth.guard', './dist/modules/auth/guards/jwt-auth.guard'); } catch (e) { log('ERR ' + e); }
try { step('current-user.decorator', './dist/modules/auth/guards/current-user.decorator'); } catch (e) { log('ERR ' + e); }
try { step('auth.service', './dist/modules/auth/auth.service'); } catch (e) { log('ERR ' + e); }
try { step('auth.controller', './dist/modules/auth/auth.controller'); } catch (e) { log('ERR ' + e); }
try { step('auth.module', './dist/modules/auth/auth.module'); } catch (e) { log('ERR ' + e); }
log('ALL');
