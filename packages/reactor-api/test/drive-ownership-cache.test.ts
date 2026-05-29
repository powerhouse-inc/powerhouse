/**
 * Unit tests for DriveOwnershipCache.
 *
 * The cache is a startup-populated, explicitly-mutated `Set<string>` of
 * drive ids the local switchboard owns. Tests cover initial population
 * (single page + paginated), idempotency on re-init, and the
 * has/add/remove API.
 */

import type { IReactorClient, PagedResults } from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { DriveOwnershipCache } from "../src/graphql/gateway/drive-ownership-cache.js";

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";

function driveDoc(id: string): PHDocument {
  return {
    header: {
      id,
      documentType: DRIVE_DOCUMENT_TYPE,
    },
  } as unknown as PHDocument;
}

function singlePage(ids: string[]): PagedResults<PHDocument> {
  return {
    results: ids.map(driveDoc),
    options: { cursor: "", limit: 100 },
  };
}

function paginatedPages(pages: string[][]): { find: IReactorClient["find"] } {
  let pageIndex = 0;
  const buildPage = (): PagedResults<PHDocument> => {
    const ids = pages[pageIndex] ?? [];
    const isLast = pageIndex === pages.length - 1;
    const result: PagedResults<PHDocument> = {
      results: ids.map(driveDoc),
      options: { cursor: String(pageIndex), limit: 100 },
    };
    if (!isLast) {
      result.next = () => {
        pageIndex += 1;
        return Promise.resolve(buildPage());
      };
    }
    return result;
  };
  return {
    find: vi.fn(() => {
      pageIndex = 0;
      return Promise.resolve(buildPage());
    }),
  };
}

function makeClient(findImpl: IReactorClient["find"]): IReactorClient {
  return { find: findImpl } as unknown as IReactorClient;
}

describe("DriveOwnershipCache", () => {
  describe("init", () => {
    it("populates the cache from a single-page result", async () => {
      const find = vi.fn(() =>
        Promise.resolve(singlePage(["drive-a", "drive-b", "drive-c"])),
      );
      const cache = new DriveOwnershipCache(makeClient(find));

      await cache.init();

      expect(find).toHaveBeenCalledWith({ type: DRIVE_DOCUMENT_TYPE });
      expect(cache.size()).toBe(3);
      expect(cache.has("drive-a")).toBe(true);
      expect(cache.has("drive-b")).toBe(true);
      expect(cache.has("drive-c")).toBe(true);
    });

    it("walks every page when results paginate", async () => {
      const cache = new DriveOwnershipCache(
        makeClient(
          paginatedPages([["drive-a", "drive-b"], ["drive-c"], ["drive-d"]])
            .find,
        ),
      );

      await cache.init();

      expect(cache.size()).toBe(4);
      for (const id of ["drive-a", "drive-b", "drive-c", "drive-d"]) {
        expect(cache.has(id)).toBe(true);
      }
    });

    it("clears existing entries before re-populating", async () => {
      const find = vi.fn(() => Promise.resolve(singlePage(["drive-a"])));
      const cache = new DriveOwnershipCache(makeClient(find));

      cache.add("stale-drive");
      expect(cache.has("stale-drive")).toBe(true);

      await cache.init();

      expect(cache.has("stale-drive")).toBe(false);
      expect(cache.has("drive-a")).toBe(true);
      expect(cache.size()).toBe(1);
    });

    it("handles an empty result set", async () => {
      const cache = new DriveOwnershipCache(
        makeClient(vi.fn(() => Promise.resolve(singlePage([])))),
      );

      await cache.init();

      expect(cache.size()).toBe(0);
    });
  });

  describe("has / add / remove", () => {
    it("reports membership accurately", () => {
      const cache = new DriveOwnershipCache(
        makeClient(vi.fn() as unknown as IReactorClient["find"]),
      );

      expect(cache.has("drive-a")).toBe(false);
      cache.add("drive-a");
      expect(cache.has("drive-a")).toBe(true);
    });

    it("remove is a no-op for unknown ids", () => {
      const cache = new DriveOwnershipCache(
        makeClient(vi.fn() as unknown as IReactorClient["find"]),
      );

      expect(() => cache.remove("not-there")).not.toThrow();
      expect(cache.has("not-there")).toBe(false);
    });

    it("add is idempotent", () => {
      const cache = new DriveOwnershipCache(
        makeClient(vi.fn() as unknown as IReactorClient["find"]),
      );

      cache.add("drive-a");
      cache.add("drive-a");
      cache.add("drive-a");

      expect(cache.size()).toBe(1);
      expect(cache.has("drive-a")).toBe(true);
    });

    it("remove deletes the entry", () => {
      const cache = new DriveOwnershipCache(
        makeClient(vi.fn() as unknown as IReactorClient["find"]),
      );

      cache.add("drive-a");
      cache.add("drive-b");
      cache.remove("drive-a");

      expect(cache.has("drive-a")).toBe(false);
      expect(cache.has("drive-b")).toBe(true);
      expect(cache.size()).toBe(1);
    });
  });
});
