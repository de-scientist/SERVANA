const fs = require('fs');
fs.writeFileSync('cv.log', 'before\n');
try {
  require('class-validator');
  fs.appendFileSync('cv.log', 'class-validator-ok\n');
} catch (e) {
  fs.appendFileSync('cv.log', 'ERR ' + e + '\n');
}
try {
  require('class-transformer');
  fs.appendFileSync('cv.log', 'class-transformer-ok\n');
} catch (e) {
  fs.appendFileSync('cv.log', 'ERR2 ' + e + '\n');
}
fs.appendFileSync('cv.log', 'done\n');
