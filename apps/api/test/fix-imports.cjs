/* Fix NotificationModule -> NotificationsModule across all integration tests */
const fs = require('fs');
const path = require('path');

const files = [
  'auth.integration.spec.ts',
  'booking-engine.integration.spec.ts',
  'phase10-loyalty.integration.spec.ts',
  'phase11-communication.integration.spec.ts',
  'phase12-analytics.integration.spec.ts',
  'phase13-ai.integration.spec.ts',
  'phase14-discovery.integration.spec.ts',
  'phase15-assistants.integration.spec.ts',
  'phase16-fraud.integration.spec.ts',
  'phase4-search-availability.integration.spec.ts',
  'phase6-payment-engine.integration.spec.ts',
  'phase7-payouts.integration.spec.ts',
  'phase9-shop.integration.spec.ts',
  'provider-marketplace.integration.spec.ts',
  'ranking.integration.spec.ts',
];

let fixed = 0;
for (const f of files) {
  const p = path.join(__dirname, f);
  let src = fs.readFileSync(p, 'utf8');
  if (src.includes('NotificationModule,') && !src.includes('NotificationsModule,')) {
    src = src.replace(/NotificationModule,/g, 'NotificationsModule,');
    fs.writeFileSync(p, src);
    console.log(`Fixed ${f}`);
    fixed++;
  } else if (src.includes('NotificationsModule,')) {
    console.log(`Already OK: ${f}`);
  } else {
    console.log(`No match: ${f}`);
  }
}
console.log(`Fixed ${fixed} files`);