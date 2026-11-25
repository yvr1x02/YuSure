import { SafeRequestError } from "@/lib/safe-request";

import type { CheckId, Outcome, ReasonCode } from "./catalog";

export type CheckResult = {
  id: CheckId;
  outcome: Outcome;
  /** Values for the {name} placeholders of the texts. */
  values?: Record<string, string>;
  /** Why the check could not run, for "non verificato". */
  reason?: ReasonCode;
  /** "Dettagli tecnici": what was read, one line each. */
  found: string[];
};

export function unverified(id: CheckId, error: SafeRequestError): CheckResult {
  return { id, outcome: "unverified", reason: error.code, found: [`${error.code}: ${error.message}`] };
}

/** Lets an expected failure through as a value; anything else is a bug and keeps throwing. */
export function asError(error: unknown): SafeRequestError {
  if (error instanceof SafeRequestError) return error;
  throw error;
}
