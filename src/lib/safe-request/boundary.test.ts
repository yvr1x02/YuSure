import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// The test seams (createSafeRequest, mapAddress) can point connections anywhere:
// outside this folder only the bound safeRequest from index.ts may be used.
const root = path.resolve(import.meta.dirname, "../../..");
const ownFolder = import.meta.dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return full === ownFolder ? [] : sourceFiles(full);
    return /\.(ts|tsx|mts|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

describe("safe-request boundary", () => {
  it("finds the source folders it guards", () => {
    expect(sourceFiles(path.join(root, "src")).length).toBeGreaterThan(0);
  });

  it("keeps createSafeRequest and mapAddress inside src/lib/safe-request", () => {
    const offenders = ["src", "e2e"]
      .flatMap((dir) => sourceFiles(path.join(root, dir)))
      .filter((file) => /\b(createSafeRequest|mapAddress)\b/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });
});
