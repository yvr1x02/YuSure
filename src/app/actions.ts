"use server";

import { ERROR_MESSAGES } from "@/lib/checks/catalog";
import { runScan, type ScanReport } from "@/lib/checks/scan";
import { inspectCertificate, normalizeAddress, safeRequest, SafeRequestError } from "@/lib/safe-request";

export type ScanState =
  | { status: "idle"; address: string }
  | { status: "error"; address: string; message: string }
  | { status: "done"; address: string; report: ScanReport };

// Longer than any address someone types: refused before parsing.
const MAX_ADDRESS_LENGTH = 2048;

/** Runs a scan and returns the report, without saving anything (M1). */
export async function scan(_previous: ScanState, formData: FormData): Promise<ScanState> {
  const address = String(formData.get("url") ?? "");
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

  const outcome = await runScan(url, { safeRequest, inspectCertificate });
  return outcome.ok
    ? { status: "done", address, report: outcome.report }
    : { status: "error", address, message: ERROR_MESSAGES[outcome.reason] };
}
