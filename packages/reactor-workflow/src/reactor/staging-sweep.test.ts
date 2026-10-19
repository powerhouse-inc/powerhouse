import { mkdir, mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sweepAttachmentStaging } from "./lib.js";

describe("sweepAttachmentStaging", () => {
  it("removes what a crashed host left, never a live step's directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "ap-sweep-"));
    try {
      await mkdir(join(root, "stale"));
      await mkdir(join(root, "live"));
      const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await utimes(join(root, "stale"), old, old);

      expect(await sweepAttachmentStaging(root)).toBe(1);
      expect(await readdir(root)).toEqual(["live"]);
      // A missing root is nothing to sweep, not an error.
      expect(await sweepAttachmentStaging(join(root, "absent"))).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
