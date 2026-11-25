import { describe, expect, it, vi } from "vitest";

import { SafeRequestError } from "./errors";
import { resolvePublic, type ResolvedAddress } from "./resolve";

// Public-looking answers are plain values here: nothing connects to them.
const v4 = (address: string): ResolvedAddress => ({ address, family: 4 });
const v6 = (address: string): ResolvedAddress => ({ address, family: 6 });

function answering(...answers: ResolvedAddress[]) {
  return vi.fn(async () => answers);
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SafeRequestError) return error.code;
    throw error;
  }
  return "ok";
}

describe("resolvePublic", () => {
  it("returns the IPv4 address when the name has both A and AAAA", async () => {
    const resolve = answering(v6("2606:4700:4700::1111"), v4("8.8.8.8"));
    await expect(resolvePublic("esempio.it", resolve)).resolves.toBe("8.8.8.8");
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("falls back to IPv6 when there is no IPv4", async () => {
    await expect(resolvePublic("esempio.it", answering(v6("2606:4700:4700::1111")))).resolves.toBe(
      "2606:4700:4700::1111",
    );
  });

  it.each([
    [[v4("8.8.8.8"), v4("10.0.0.1")]],
    [[v4("10.0.0.1"), v4("8.8.8.8")]],
    [[v4("8.8.8.8"), v6("::1")]],
    [[v4("8.8.8.8"), v6("::ffff:127.0.0.1")]],
    [[v6("2606:4700:4700::1111"), v6("fd00::1")]],
    [[v4("169.254.169.254")]],
  ])("blocks a name when even one address is not public: %j", async (answers) => {
    await expect(codeOf(resolvePublic("esempio.it", answering(...answers)))).resolves.toBe("not_public");
  });

  it("reports a name that does not exist", async () => {
    const resolve = vi.fn(async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    });
    await expect(codeOf(resolvePublic("nonesiste.it", resolve))).resolves.toBe("dns_failed");
  });

  it("reports an empty answer", async () => {
    await expect(codeOf(resolvePublic("esempio.it", answering()))).resolves.toBe("dns_failed");
  });
});
