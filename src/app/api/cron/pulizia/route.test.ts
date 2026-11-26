import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteExpiredRequests } from "@/lib/limits";

import { GET } from "./route";

vi.mock("@/lib/limits", () => ({ deleteExpiredRequests: vi.fn(async () => 3) }));

const call = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/pulizia", { headers: authorization ? { authorization } : {} }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("cron cleanup", () => {
  it("deletes with the right secret", async () => {
    vi.stubEnv("CRON_SECRET", "segreto-di-prova");
    const response = await call("Bearer segreto-di-prova");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: 3 });
  });

  it.each([undefined, "Bearer sbagliato", "segreto-di-prova", "Bearer segreto-di-prova-e-altro"])(
    "refuses authorization %j",
    async (authorization) => {
      vi.stubEnv("CRON_SECRET", "segreto-di-prova");
      expect((await call(authorization)).status).toBe(401);
      expect(deleteExpiredRequests).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, ""])("refuses everyone when CRON_SECRET is %j", async (value) => {
    vi.stubEnv("CRON_SECRET", value);
    expect((await call("Bearer ")).status).toBe(401);
    expect((await call("Bearer undefined")).status).toBe(401);
    expect(deleteExpiredRequests).not.toHaveBeenCalled();
  });
});
