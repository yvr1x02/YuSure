"use server";

import { ipAddress } from "@vercel/functions";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ERROR_MESSAGES } from "@/lib/checks/catalog";
import { runScan } from "@/lib/checks/scan";
import { hashIp, reserveScan } from "@/lib/limits";
import { inspectCertificate, normalizeAddress, safeRequest, SafeRequestError } from "@/lib/safe-request";
import { isScanEnabled } from "@/lib/scan-enabled";
import { findRecentScanId, saveScan } from "@/lib/scans";

export type ScanState = { status: "idle"; address: string } | { status: "error"; address: string; message: string };

// Longer than any address someone types: refused before parsing.
const MAX_ADDRESS_LENGTH = 2048;

/** Opens the report of the address: from the 24-hour cache, or from a new scan within the limits (ADR-0003). */
export async function scan(_previous: ScanState, formData: FormData): Promise<ScanState> {
  const address = String(formData.get("url") ?? "");
  // Refused before any parsing or network: this endpoint is public even when the form is hidden.
  if (!isScanEnabled()) return { status: "error", address: "", message: ERROR_MESSAGES.scan_disabled };
  if (!address.trim()) return { status: "error", address, message: ERROR_MESSAGES.empty_address };
  if (address.length > MAX_ADDRESS_LENGTH) {
    return { status: "error", address: "", message: ERROR_MESSAGES.invalid_url };
  }

  let url: URL;
  try {
    url = normalizeAddress(address);
  } catch (error) {
    if (error instanceof SafeRequestError) return { status: "error", address, message: ERROR_MESSAGES[error.code] };
    throw error;
  }

  const secret = process.env.IP_HASH_SECRET;
  const ip = clientIp(await headers());
  if (!secret || !ip) {
    console.error(`[scan] refused: ${secret ? "no client IP" : "IP_HASH_SECRET is not set"}`);
    return { status: "error", address, message: ERROR_MESSAGES.scan_unavailable };
  }

  let id: string;
  try {
    const outcome = await reuseOrScan(url, hashIp(ip, secret));
    if (!outcome.ok) return { status: "error", address, message: ERROR_MESSAGES[outcome.reason] };
    id = outcome.id;
  } catch (error) {
    console.error("[scan] failed:", error);
    return { status: "error", address, message: ERROR_MESSAGES.scan_unavailable };
  }
  // Outside the try: redirect() works by throwing.
  redirect(`/report/${id}`);
}

async function reuseOrScan(url: URL, ipHash: string) {
  const cached = await findRecentScanId(url);
  if (cached) return { ok: true, id: cached } as const;

  const refusal = await reserveScan(ipHash);
  if (refusal) return { ok: false, reason: refusal } as const;

  const outcome = await runScan(url, { safeRequest, inspectCertificate });
  if (!outcome.ok) return outcome;
  return { ok: true, id: await saveScan(url, outcome.report) } as const;
}

/** Vercel sets x-real-ip. Outside Vercel (next dev, e2e) every request counts as one local client. */
function clientIp(requestHeaders: Headers): string | undefined {
  return ipAddress(requestHeaders) ?? (process.env.VERCEL ? undefined : "local");
}
