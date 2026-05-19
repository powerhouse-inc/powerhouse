import { describe, expect, it } from "vitest";
import {
  bucketFor,
  hashDocumentId,
} from "../../../src/executor/worker-pool-router.js";

describe("worker-pool-router", () => {
  describe("hashDocumentId", () => {
    it("returns the same hash for the same input", () => {
      const a = hashDocumentId("doc-1");
      const b = hashDocumentId("doc-1");
      expect(a).toBe(b);
    });

    it("returns different hashes for different inputs", () => {
      const a = hashDocumentId("doc-1");
      const b = hashDocumentId("doc-2");
      expect(a).not.toBe(b);
    });

    it("returns an unsigned 32-bit integer", () => {
      for (const id of ["", "a", "doc-1", "doc-2", "x".repeat(256)]) {
        const h = hashDocumentId(id);
        expect(Number.isInteger(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(2 ** 32);
      }
    });
  });

  describe("bucketFor", () => {
    it("is deterministic", () => {
      expect(bucketFor("doc-1", 4)).toBe(bucketFor("doc-1", 4));
    });

    it("returns a bucket in [0, numWorkers)", () => {
      const N = 8;
      for (let i = 0; i < 200; i++) {
        const b = bucketFor(`doc-${i}`, N);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(N);
      }
    });

    it("distributes broadly across buckets", () => {
      const N = 4;
      const counts = new Array<number>(N).fill(0);
      for (let i = 0; i < 1000; i++) {
        counts[bucketFor(`doc-${i}`, N)]++;
      }
      for (const c of counts) {
        expect(c).toBeGreaterThan(100);
      }
    });

    it("throws when numWorkers < 1", () => {
      expect(() => bucketFor("doc-1", 0)).toThrow();
      expect(() => bucketFor("doc-1", -1)).toThrow();
    });
  });
});
