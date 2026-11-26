/**
 * Scans run only where SCAN_ENABLED is "true" (on Vercel: Preview and, since M3 added the
 * limits of ADR-0003, Production). The static Home reads it at build time, the Server
 * Action at every request: after changing it on Vercel, redeploy.
 */
export function isScanEnabled(): boolean {
  return process.env.SCAN_ENABLED === "true";
}
