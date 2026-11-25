import { describe, expect, it } from "vitest";

import { SafeRequestError, type CertificateInfo } from "@/lib/safe-request";

import { evaluateCertificate } from "./certificate";

const now = new Date("2026-11-25T12:00:00Z");

function certificate(validTo: string, overrides: Partial<CertificateInfo> = {}): CertificateInfo {
  return {
    address: "8.8.8.8",
    authorized: true,
    authorizationError: undefined,
    validFrom: new Date("2026-01-01T00:00:00Z"),
    validTo: new Date(validTo),
    issuer: "Let's Encrypt",
    subjectAltNames: ["DNS:esempio.it"],
    ...overrides,
  };
}

describe("evaluateCertificate", () => {
  it("is ok and gives the expiry date in Italian", () => {
    const [valid, expiry] = evaluateCertificate(certificate("2027-03-12T10:00:00Z"), now);
    expect(valid).toMatchObject({ id: "certificateValid", outcome: "ok" });
    expect(expiry).toMatchObject({ id: "certificateExpiry", outcome: "ok", values: { date: "12 marzo 2027" } });
  });

  it("uses the Italian calendar day near midnight", () => {
    const [, expiry] = evaluateCertificate(certificate("2027-03-12T23:30:00Z"), now);
    expect(expiry.values?.date).toBe("13 marzo 2027");
  });

  it("warns under 14 days and not at 14", () => {
    expect(evaluateCertificate(certificate("2026-12-09T11:59:00Z"), now)[1].outcome).toBe("warning");
    expect(evaluateCertificate(certificate("2026-12-09T12:00:00Z"), now)[1].outcome).toBe("ok");
  });

  it("is a problem when the certificate is rejected, with the reason in the details", () => {
    const info = certificate("2027-03-12T10:00:00Z", { authorized: false, authorizationError: "ERR_TLS_CERT_ALTNAME_INVALID" });
    const [valid, expiry] = evaluateCertificate(info, now);
    expect(valid.outcome).toBe("problem");
    expect(valid.found[0]).toBe("Rifiutato: ERR_TLS_CERT_ALTNAME_INVALID");
    expect(expiry.outcome).toBe("ok");
  });

  it("counts an expired certificate once, in the validity check", () => {
    const info = certificate("2026-11-20T00:00:00Z", { authorized: false, authorizationError: "CERT_HAS_EXPIRED" });
    const [valid, expiry] = evaluateCertificate(info, now);
    expect(valid.outcome).toBe("problem");
    expect(expiry).toMatchObject({ outcome: "unverified", reason: "certificate_expired" });
  });

  it("leaves both unverified when port 443 is closed, since the https check reports it", () => {
    const results = evaluateCertificate(new SafeRequestError("connection_refused", "ECONNREFUSED"), now);
    expect(results.map((r) => [r.outcome, r.reason])).toEqual([
      ["unverified", "no_https"],
      ["unverified", "no_https"],
    ]);
  });

  it("is unverified on a timeout, or at the scan deadline", () => {
    expect(evaluateCertificate(new SafeRequestError("timeout", "x"), now)[0].reason).toBe("timeout");
    expect(evaluateCertificate(new SafeRequestError("scan_deadline", "x"), now)[1].reason).toBe("scan_deadline");
  });
});
