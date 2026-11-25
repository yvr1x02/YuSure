/**
 * Scans run only where SCAN_ENABLED is "true": Preview, until M3 brings the per-IP and
 * global limits (ADR-0003). The static Home reads it at build time, the Server Action
 * at every request: after changing it on Vercel, redeploy.
 */
export function isScanEnabled(): boolean {
  return process.env.SCAN_ENABLED === "true";
}
