/**
 * Production boot guards. Imported by main.ts (never import main.ts itself
 * in tests — it bootstraps the application on load).
 */
export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  const bad = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter((k) => {
    const v = env[k] ?? '';
    return v.length < 32 || v.startsWith('change_me');
  });
  if (bad.length > 0) {
    throw new Error(
      `Refusing to boot in production with weak/missing secrets: ${bad.join(', ')}`,
    );
  }
}

/**
 * Non-fatal production hygiene checks. Unsigned payment callbacks are accepted
 * by the simulated adapter only when NO webhook secret is configured, so a
 * production boot without MPESA_WEBHOOK_SECRET is a money-forgery risk.
 * Returns warning strings (empty when clean) so callers can log them.
 */
export function insecureIntegrationWarnings(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const warnings: string[] = [];
  if (!env.MPESA_WEBHOOK_SECRET) {
    warnings.push('MPESA_WEBHOOK_SECRET is unset: payment webhooks cannot be authenticated');
  }
  const origins = (env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length === 0) {
    warnings.push('CORS_ORIGINS is unset: API boots with a localhost default — set explicit origins');
  }
  return warnings;
}
