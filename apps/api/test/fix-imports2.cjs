/* Add NotificationsModule import to all integration tests that use it */
const fs = require('fs');
const path = require('path');

const files = [
  'auth.integration.spec.ts',
  'booking-engine.integration.spec.ts',
  'phase4-search-availability.integration.spec.ts',
  'phase6-payment-engine.integration.spec.ts',
  'phase7-payouts.integration.spec.ts',
  'phase9-shop.integration.spec.ts',
  'phase10-loyalty.integration.spec.ts',
  'phase11-communication.integration.spec.ts',
  'phase12-analytics.integration.spec.ts',
  'phase13-ai.integration.spec.ts',
  'phase14-discovery.integration.spec.ts',
  'phase15-assistants.integration.spec.ts',
  'phase16-fraud.integration.spec.ts',
  'provider-marketplace.integration.spec.ts',
  'ranking.integration.spec.ts',
];

const IMPORT_LINE = `import { NotificationsModule } from '../src/modules/notifications/notifications.module';`;

let fixed = 0;
for (const f of files) {
  const p = path.join(__dirname, f);
  let src = fs.readFileSync(p, 'utf8');
  if (src.includes('NotificationsModule,') && !src.includes('import { NotificationsModule }')) {
    // Insert after the last import line
    const lines = src.split('\n');
    let insertAt = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('import ') && lines[i].includes("from '")) {
        insertAt = i;
      }
    }
    if (insertAt >= 0) {
      lines.splice(insertAt + 1, 0, IMPORT_LINE);
      src = lines.join('\n');
      fs.writeFileSync(p, src);
      console.log(`Added import to ${f}`);
      fixed++;
    } else {
      console.log(`Could not find insert point for ${f}`);
    }
  } else if (src.includes('import { NotificationsModule }')) {
    console.log(`Already has import: ${f}`);
  } else {
    console.log(`No NotificationsModule usage: ${f}`);
  }
}
console.log(`Fixed ${fixed} files`);