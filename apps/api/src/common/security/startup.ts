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
