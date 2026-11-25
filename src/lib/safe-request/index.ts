import { createSafeRequest } from "./create";
import { systemResolver } from "./resolve";

export { SafeRequestError, type SafeRequestErrorCode } from "./errors";
export type { SafeRequestOptions, SafeResponse } from "./create";
export { normalizeAddress } from "./url";

/** The only way to reach an address typed by a user (ADR-0002). */
export const { safeRequest } = createSafeRequest({
  resolve: systemResolver,
  mapAddress: (ip, port) => ({ host: ip, port }),
  timeoutMs: 10_000,
  maxBytes: 2 * 1024 * 1024,
});
