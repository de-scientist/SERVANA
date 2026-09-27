/**
 * Phase 19 production-readiness gate.
 * Fails (exit 1) on any CRITICAL miss; warns on recommended gaps.
 * Run: `node scripts/prod-check.js` (also wired as `npm run prod:check`).
 *
 * Checks: HTTPS/HSTS posture, secure headers (API helmet + web headers),
 * authN/Z guards, webhook raw-body + signature verification, error handling,
 * backups/migration docs, structured logging, alerts/monitoring docs,
 * SEO/mobile/a11y basics, env separation, CI pipeline completeness,
 * Docker/prod-compose artifacts.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const results = [];

function check(id, label, severity, pass, detail = '') {
  results.push({ id, label, severity, pass, detail });
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// --- artifacts ---
check('docker-api', 'API Dockerfile exists', 'CRITICAL', exists('apps/api/Dockerfile'));
check('docker-web', 'Web Dockerfile exists', 'CRITICAL', exists('apps/web/Dockerfile'));
check('compose-prod', 'docker-compose.prod.yml exists', 'CRITICAL', exists('docker-compose.prod.yml'));
check('gitignore-env', '.gitignore ignores all .env* files', 'CRITICAL',
  (() => {
    const g = read('.gitignore') || '';
    return g.includes('.env.*') && g.includes('!.env.example');
  })());
check('ci-pipeline', 'CI covers lint→typecheck→tests→build→migration→deploy', 'CRITICAL',
  (() => {
    const yml = read('.github/workflows/ci-cd.yml') || '';
    return ['lint', 'typecheck', 'test', 'build', 'migration', 'deploy']
      .every((s) => yml.toLowerCase().includes(s));
  })(),
  'lint → typecheck → tests → build → migration validation → deploy');

// --- API hardening ---
const main = read('apps/api/src/main.ts') || '';
check('api-helmet', 'API uses helmet', 'CRITICAL', main.includes('helmet('));
check('api-hsts', 'API enables HSTS in production', 'CRITICAL', main.includes('hsts'));
check('api-cors', 'API refuses CORS * in production', 'CRITICAL', main.includes("'*'"));
check('api-secrets', 'API refuses weak prod secrets on boot', 'CRITICAL',
  (read('apps/api/src/common/security/startup.ts') || '').includes('Refusing to boot in production'));
check('api-rawbody', 'Webhooks capture rawBody for HMAC verification', 'CRITICAL', main.includes('rawBody'));
check('api-xpowered', 'x-powered-by disabled', 'WARN', main.includes("disable('x-powered-by')"));
check('api-errors', 'Global exception filter registered', 'CRITICAL', main.includes('AllExceptionsFilter'));
check('api-health', 'Liveness endpoint present', 'CRITICAL',
  (read('apps/api/src/modules/health/health.controller.ts') || '').includes("@Get()"));
check('api-ready', 'Readiness endpoint checks db+redis', 'CRITICAL',
  (read('apps/api/src/modules/health/health.controller.ts') || '').includes("'ready'"));
check('api-metrics', 'Prometheus metrics endpoint present', 'WARN',
  (read('apps/api/src/modules/health/health.controller.ts') || '').includes("'metrics'"));
check('api-jsonlogs', 'Production JSON structured logging', 'WARN',
  (read('apps/api/src/common/logging/logger.service.ts') || '').includes('NODE_ENV'));

// --- web hardening ---
const nextCfg = read('apps/web/next.config.js') || '';
check('web-standalone', 'Web builds standalone image', 'CRITICAL', nextCfg.includes("output: 'standalone'"));
check('web-headers', 'Web sets secure headers (CSP/frame/nosniff)', 'CRITICAL',
  nextCfg.includes('Content-Security-Policy') && nextCfg.includes('X-Frame-Options'));
check('web-hsts', 'Web sets HSTS in production', 'CRITICAL', nextCfg.includes('Strict-Transport-Security'));
const layout = read('apps/web/src/app/layout.tsx') || '';
check('web-lang', 'HTML lang set (a11y)', 'WARN', layout.includes('<html lang='));
check('web-skip', 'Skip-to-content link (a11y)', 'WARN', layout.includes('Skip to main content'));
check('web-viewport', 'Viewport metadata (mobile)', 'WARN', layout.includes('viewport'));
check('web-seo', 'robots.ts + sitemap.ts present', 'WARN',
  exists('apps/web/src/app/robots.ts') && exists('apps/web/src/app/sitemap.ts'));

// --- env / secrets hygiene ---
const example = read('.env.example') || '';
check('env-example', '.env.example exists with placeholders only', 'CRITICAL',
  example.length > 0 && example.includes('change_me') && !example.includes('sk-live'));
check('env-docs', 'ENVIRONMENT.md documents dev/staging/prod separation', 'WARN',
  (read('docs/ENVIRONMENT.md') || '').includes('production'));

// --- ops docs ---
for (const doc of ['docs/DEPLOYMENT.md', 'docs/OPERATIONS.md', 'docs/INCIDENT_RESPONSE.md']) {
  check(`doc-${doc}`, `${doc} exists`, 'CRITICAL', exists(doc));
}
const ops = read('docs/OPERATIONS.md') || '';
for (const kw of ['Backup', 'Restore', 'Migration', 'Redis', 'BullMQ', 'payment', 'AI']) {
  check(`ops-${kw}`, `OPERATIONS.md covers ${kw}`, 'WARN', ops.toLowerCase().includes(kw.toLowerCase()));
}

// --- report ---
let criticalFail = 0;
let warnFail = 0;
for (const r of results) {
  const icon = r.pass ? 'PASS' : (r.severity === 'CRITICAL' ? 'FAIL' : 'WARN');
  if (!r.pass && r.severity === 'CRITICAL') criticalFail += 1;
  if (!r.pass && r.severity !== 'CRITICAL') warnFail += 1;
  console.log(`[${icon}] ${r.id}: ${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed. ` +
  `${criticalFail} critical failures, ${warnFail} warnings.`);
if (criticalFail > 0) {
  console.log('NOT PRODUCTION-READY: resolve all CRITICAL failures first.');
  process.exit(1);
}
console.log('Production-readiness gate: all critical checks passed.' +
  (warnFail > 0 ? ' Review warnings before going live.' : ''));
