import { describe, expect, it } from "vitest";

import { isPublicAddress } from "./ip";

describe("isPublicAddress", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
  ])("rejects private or reserved IPv4 %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.0", "100.63.255.255", "100.128.0.0"])(
    "accepts public IPv4 %s",
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );

  it.each([
    "::",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12::1",
    "ff02::1",
    "2001:db8::1",
    "3fff::1",
    "100::1",
    "2001::1",
    "2002:7f00:1::",
    "64:ff9b::7f00:1",
    "::127.0.0.1",
    "fec0::1",
  ])("rejects non-public IPv6 %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it("accepts public IPv6", () => {
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });

  it.each(["::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:169.254.169.254"])(
    "rejects private IPv4 inside IPv6 %s",
    (ip) => {
      expect(isPublicAddress(ip)).toBe(false);
    },
  );

  it("treats a public IPv4 inside IPv6 like the IPv4 itself", () => {
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
  });

  it.each(["", "localhost", "999.0.0.1", "2130706433", "fe80::1%eth0"])(
    "rejects what is not an IP address: %j",
    (value) => {
      expect(isPublicAddress(value)).toBe(false);
    },
  );
});
