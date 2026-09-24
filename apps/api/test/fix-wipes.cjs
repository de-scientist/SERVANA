/* Fix wipe functions: add customerProfile and providerProfile deletes before user.deleteMany */
const fs = require('fs');
const path = require('path');

const files = [
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
  'provider-marketplace.integration.spec.ts',
  'ranking.integration.spec.ts',
];

let fixed = 0;
for (const f of files) {
  const p = path.join(__dirname, f);
  let src = fs.readFileSync(p, 'utf8');
  // Replace "await prisma.user.deleteMany({});" with the three deletes
  if (src.includes('await prisma.user.deleteMany({});') && !src.includes('await prisma.customerProfile.deleteMany({});')) {
    src = src.replace(
      'await prisma.user.deleteMany({});',
      'await prisma.customerProfile.deleteMany({});\n    await prisma.providerProfile.deleteMany({});\n    await prisma.user.deleteMany({});'
    );
    fs.writeFileSync(p, src);
    console.log(`Fixed wipe in ${f}`);
    fixed++;
  } else if (src.includes('await prisma.customerProfile.deleteMany({});')) {
    console.log(`Already fixed: ${f}`);
  } else {
    console.log(`No match: ${f}`);
  }
}
console.log(`Fixed ${fixed} files`);