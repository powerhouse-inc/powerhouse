import { bucketFor, DriveCollectionId } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import { NoEligibleBackendError, UnknownBackendError } from "../src/errors.js";
import {
  eligibleBackends,
  ineligibleReason,
  placeCollection,
} from "../src/placement.js";
import { RouterTable } from "../src/table.js";
import {
  collectionRequirements,
  NO_REQUIREMENTS,
  type ReactorBackend,
} from "../src/types.js";
import {
  FakeReactor,
  inProcessCapabilities,
  workflowCapabilities,
} from "./stubs.js";

function backends(...names: string[]): ReactorBackend[] {
  return names.map((name) =>
    new FakeReactor(name, inProcessCapabilities(name)).backend(),
  );
}

function workflowBackend(name: string): ReactorBackend {
  return new FakeReactor(name, workflowCapabilities(name)).backend();
}

const collection = (driveId: string, branch = "main"): DriveCollectionId =>
  DriveCollectionId.forDrive(driveId, branch);

describe("placement", () => {
  it("keys on the collection id through the reactor's own bucketFor", () => {
    const pool = backends("one", "two", "three");
    const target = collection("drive-a");

    const placed = placeCollection(target, pool, NO_REQUIREMENTS);

    expect(placed.name).toBe(pool[bucketFor(target.key, 3)]?.name);
  });

  it("is deterministic and branch-aware", () => {
    const pool = backends("one", "two", "three");

    const main = placeCollection(collection("drive-a"), pool, NO_REQUIREMENTS);
    const again = placeCollection(collection("drive-a"), pool, NO_REQUIREMENTS);

    expect(again.name).toBe(main.name);
    // A branch is its own placeable unit, so the key -- and therefore the
    // bucket -- differs from the main branch's.
    expect(collection("drive-a", "draft").key).not.toBe(
      collection("drive-a").key,
    );
  });

  it("spreads collections across the pool", () => {
    const pool = backends("one", "two", "three");
    const chosen = new Set<string>();

    for (let i = 0; i < 60; i++) {
      chosen.add(
        placeCollection(collection(`drive-${i}`), pool, NO_REQUIREMENTS).name,
      );
    }

    expect(chosen.size).toBe(3);
  });

  it("hashes over the capability-eligible subset only", () => {
    const pool = [
      ...backends("browser-one", "browser-two"),
      workflowBackend("node-one"),
    ];
    const needsWorkflows = collectionRequirements({ workflows: true });

    for (let i = 0; i < 20; i++) {
      const placed = placeCollection(
        collection(`workflow-drive-${i}`),
        pool,
        needsWorkflows,
      );
      expect(placed.name).toBe("node-one");
    }
  });

  it("names the reason per backend when nothing is eligible", () => {
    const pool = backends("browser-one", "browser-two");

    const refusal = (): unknown =>
      placeCollection(
        collection("workflow-drive"),
        pool,
        collectionRequirements({ workflows: true }),
      );

    expect(refusal).toThrow(NoEligibleBackendError);
    expect(refusal).toThrow(/capabilities.workflows is false/);
  });

  it("reads every requirement off the capability contract", () => {
    const browser = inProcessCapabilities("browser");

    expect(ineligibleReason(browser, NO_REQUIREMENTS)).toBe("");
    expect(
      ineligibleReason(browser, collectionRequirements({ processors: true })),
    ).toBe("");
    expect(
      ineligibleReason(browser, collectionRequirements({ workflows: true })),
    ).toMatch(/workflow engine/);
    expect(
      ineligibleReason(
        browser,
        collectionRequirements({ durableStorage: true }),
      ),
    ).toMatch(/non-durable memory store/);
    expect(
      ineligibleReason(
        browser,
        collectionRequirements({ syncChannels: ["polling"] }),
      ),
    ).toMatch(/does not route the polling sync channel/);
    expect(
      ineligibleReason(
        workflowCapabilities("node"),
        collectionRequirements({ syncChannels: ["polling"] }),
      ),
    ).toBe("");
  });

  it("filters the eligible set without reordering it", () => {
    const pool = [
      ...backends("browser-one"),
      workflowBackend("node-one"),
      ...backends("browser-two"),
    ];

    const eligible = eligibleBackends(
      pool,
      collectionRequirements({ workflows: true }),
    );

    expect(eligible.map((backend) => backend.name)).toEqual(["node-one"]);
  });
});

describe("RouterTable", () => {
  it("prefers an explicit override over the hash", () => {
    const pool = backends("one", "two", "three");
    const target = collection("drive-a");
    const hashed = placeCollection(target, pool, NO_REQUIREMENTS).name;
    const other = pool.find((backend) => backend.name !== hashed)?.name ?? "";
    const table = new RouterTable(pool, {
      collections: { [target.key]: other },
    });

    const route = table.collectionRoute(target);

    expect(route.backend).toBe(other);
    expect(route.source).toBe("override");
  });

  it("accepts an override keyed by bare drive id, for every branch", () => {
    const pool = backends("one", "two");
    const table = new RouterTable(pool, { collections: { "drive-a": "two" } });

    expect(table.collectionRoute(collection("drive-a")).backend).toBe("two");
    expect(table.collectionRoute(collection("drive-a", "draft")).backend).toBe(
      "two",
    );
  });

  it("refuses an override naming a backend it does not hold", () => {
    expect(
      () =>
        new RouterTable(backends("one"), {
          collections: { "drive-a": "nope" },
        }),
    ).toThrow(UnknownBackendError);
  });

  it("refuses duplicate backend names and an empty pool", () => {
    const one = new FakeReactor("one", inProcessCapabilities("one")).backend();
    expect(() => new RouterTable([one, one])).toThrow(/Duplicate/);
    expect(() => new RouterTable([])).toThrow(/at least one backend/);
  });

  it("prefers a learned route over the hash, and a correction over an override", () => {
    const pool = backends("one", "two", "three");
    const target = collection("drive-a");
    const table = new RouterTable(pool, { collections: { "drive-a": "one" } });

    expect(table.collectionRoute(target).source).toBe("override");

    table.recordLearnedCollection(target, "two");
    // An override still wins over a mere probe result: the operator's
    // instruction is the stronger statement until a backend refuses it.
    expect(table.collectionRoute(target).backend).toBe("one");

    // A CORRECTION does outrank it: the override named a backend that refused
    // the operation, so honouring it again would repeat the refusal forever.
    table.recordCorrectedCollection(target, "three");
    const corrected = table.collectionRoute(target);
    expect(corrected.backend).toBe("three");
    expect(corrected.source).toBe("corrected");
  });

  it("skips an excluded placement and picks another eligible backend", () => {
    const pool = backends("one", "two", "three");
    const target = collection("drive-a");
    const hashed = placeCollection(target, pool, NO_REQUIREMENTS).name;

    const route = table(pool).collectionRoute(target, new Set([hashed]));

    expect(route.backend).not.toBe(hashed);
  });

  it("honours per-collection requirements when placing", () => {
    const pool = [...backends("browser"), workflowBackend("node")];
    const table = new RouterTable(pool, {
      requirements: { "workflow-drive": { workflows: true } },
    });

    expect(table.collectionRoute(collection("workflow-drive")).backend).toBe(
      "node",
    );
    expect(table.requirementsFor(collection("workflow-drive")).workflows).toBe(
      true,
    );
    expect(table.requirementsFor(collection("other")).workflows).toBe(false);
  });

  it("bounds the document cache by dropping the oldest entry", () => {
    const pool = backends("one", "two");
    const table = new RouterTable(pool, { documentCacheSize: 2 });

    table.recordDocument("a", "one");
    table.recordDocument("b", "one");
    table.recordDocument("c", "two");

    expect(table.documentBackend("a")).toBe("");
    expect(table.documentBackend("b")).toBe("one");
    expect(table.documentBackend("c")).toBe("two");
  });

  it("reports what it believes, with the evidence", () => {
    const pool = backends("one", "two");
    const table = new RouterTable(pool, { collections: { "drive-a": "one" } });
    table.recordCorrectedCollection(collection("drive-b"), "two");
    table.recordDocument("doc-1", "two");
    table.recordJob("job-1", "two");

    const snapshot = table.describe();

    expect(snapshot.backends).toEqual(["one", "two"]);
    expect(snapshot.collections).toEqual(
      expect.arrayContaining([
        { collectionId: "drive-a", backend: "one", source: "override" },
        {
          collectionId: collection("drive-b").key,
          backend: "two",
          source: "corrected",
        },
      ]),
    );
    expect(snapshot.documents).toEqual([
      { identifier: "doc-1", backend: "two" },
    ]);
    expect(snapshot.jobs).toEqual([{ jobId: "job-1", backend: "two" }]);
  });
});

function table(pool: ReactorBackend[]): RouterTable {
  return new RouterTable(pool);
}
