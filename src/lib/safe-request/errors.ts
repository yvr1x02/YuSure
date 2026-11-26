export type SafeRequestErrorCode =
  | "invalid_url"
  | "not_allowed"
  | "not_public"
  | "dns_failed"
  | "connection_refused"
  | "connection_reset"
  | "connection_failed"
  | "timeout"
  | "scan_deadline"
  | "too_large"
  | "too_many_redirects"
  | "tls_error"
  | "bad_response";

/** `code` drives the message shown to the user; `message` is the technical reason, for server logs only. */
export class SafeRequestError extends Error {
  constructor(
    readonly code: SafeRequestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SafeRequestError";
  }
}
