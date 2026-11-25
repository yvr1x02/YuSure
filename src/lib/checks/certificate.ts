import { SafeRequestError, type CertificateInfo } from "@/lib/safe-request";

import { unverified, type CheckResult } from "./result";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_DAYS = 14;

const italianDate = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Rome",
});

/** "Certificato valido" and "Scadenza del certificato", from one TLS connection. */
export function evaluateCertificate(
  result: CertificateInfo | SafeRequestError,
  now: Date,
): [CheckResult, CheckResult] {
  if (result instanceof SafeRequestError) {
    // Port 443 closed is already the https check's problem: counted once.
    if (result.code === "connection_refused") {
      const found = [`${result.code}: ${result.message}`];
      return [
        { id: "certificateValid", outcome: "unverified", reason: "no_https", found },
        { id: "certificateExpiry", outcome: "unverified", reason: "no_https", found },
      ];
    }
    return [unverified("certificateValid", result), unverified("certificateExpiry", result)];
  }

  const found = [
    `Emesso da: ${result.issuer ?? "sconosciuto"}`,
    `Nomi: ${result.subjectAltNames.join(", ") || "nessuno"}`,
    `Valido dal ${result.validFrom.toISOString()} al ${result.validTo.toISOString()}`,
  ];
  const valid: CheckResult = result.authorized
    ? { id: "certificateValid", outcome: "ok", found }
    : { id: "certificateValid", outcome: "problem", found: [`Rifiutato: ${result.authorizationError}`, ...found] };

  const date = italianDate.format(result.validTo);
  const daysLeft = (result.validTo.getTime() - now.getTime()) / DAY_MS;
  const expiryFound = [`Scadenza: ${result.validTo.toISOString()} (${Math.floor(daysLeft)} giorni)`];
  // An expired certificate is already the validity check's problem: counted once.
  const expiry: CheckResult =
    daysLeft <= 0
      ? { id: "certificateExpiry", outcome: "unverified", reason: "certificate_expired", found: expiryFound }
      : { id: "certificateExpiry", outcome: daysLeft < EXPIRY_WARNING_DAYS ? "warning" : "ok", values: { date }, found: expiryFound };

  return [valid, expiry];
}
