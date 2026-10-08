import type { Action, Operation } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { RouteDispatcher } from "../src/dispatcher.js";
import {
  CrossBackendBatchError,
  RoutingReactorClient,
  WrongBackendError,
  type RoutableBackendConfig,
  type RoutingClientOptions,
} from "../src/index.js";
import { FakeBackend, fakeDocument, silent } from "./stubs.js";

function router(
  backends: RoutableBackendConfig[],
  options: RoutingClientOptions = {},
): RoutingReactorClient {
  return new RoutingReactorClient(backends, {
    onDiagnostic: silent,
    ...options,
  });
}

function job(key: string, documentId: string, actions: string[] = []) {
  return {
    key,
    documentId,
    scope: "document",
    branch: "main",
    actions: actions.map((type) => ({ type })) as unknown as Action[],
    dependsOn: [] as string[],
  };
}

function loadJob(documentId: string, first: string) {
  return {
    key: "l",
    documentId,
    scope: "document",
    branch: "main",
    operations: [{ action: { type: first } }] as unknown as Operation[],
    dependsOn: [],
    externalDeps: [],
  };
}

const ids = (prefix: string) =>
  Array.from({ length: 20 }, (_, i) => `${prefix}-${i}`);

/** doc on two, its route stale on one. */
function staleRoute(id: string, refuses: boolean) {
  const one = new FakeBackend("one");
  const two = new FakeBackend("two");
  one.refuses = refuses;
  two.refuses = refuses;
  two.seed(fakeDocument({ id }));
  const client = router([one.config(), two.config()], {
    documents: { [id]: "one" },
  });
  return { one, two, client };
}

describe("a batch that creates an id another backend holds", () => {
  for (const refuses of [false, true]) {
    const label = refuses ? "refusing" : "non-refusing";

    it(`loads a full history on the holder over a stale route (${label})`, async () => {
      for (const id of ids("doc")) {
        const { one, two, client } = staleRoute(id, refuses);

        await client.loadBatch({ jobs: [loadJob(id, "CREATE_DOCUMENT")] });

        expect(one.count("loadBatch"), id).toBe(0);
        expect(two.count("loadBatch"), id).toBe(1);
      }
    });

    it(`creates on the holder over a stale route (${label})`, async () => {
      for (const id of ids("doc")) {
        const { one, two, client } = staleRoute(id, refuses);

        await client.executeBatch({
          jobs: [job("c", id, ["CREATE_DOCUMENT"])],
        });

        expect(one.count("executeBatch"), id).toBe(0);
        expect(two.count("executeBatch"), id).toBe(1);
      }
    });
  }

  it("reports a created id held elsewhere at its holder beside the parent", async () => {
    const one = new FakeBackend("one");
    const two = new FakeBackend("two");
    one.seed(
      fakeDocument({
        id: "drive-d",
        documentType: "powerhouse/document-drive",
      }),
    );
    two.seed(fakeDocument({ id: "child" }));
    const client = router([one.config(), two.config()]);

    const run = client.executeBatch({
      jobs: [
        job("create", "child", ["CREATE_DOCUMENT"]),
        {
          ...job("link", "drive-d", ["ADD_RELATIONSHIP"]),
          dependsOn: ["create"],
        },
      ],
    });

    await expect(run).rejects.toThrow(CrossBackendBatchError);
    await expect(run).rejects.toThrow(/child@two/);
    await expect(run).rejects.toThrow(/drive-d@one/);
    expect(one.count("executeBatch") + two.count("executeBatch")).toBe(0);
  });
});

describe("a batch that creates a document and links it into a parent", () => {
  it("runs on the parent's backend whatever the new id hashes to", async () => {
    for (const id of ids("fresh")) {
      const one = new FakeBackend("one");
      const two = new FakeBackend("two");
      one.seed(
        fakeDocument({
          id: "drive-d",
          documentType: "powerhouse/document-drive",
        }),
      );
      const client = router([one.config(), two.config()]);

      await client.executeBatch({
        jobs: [
          job("create", id, ["CREATE_DOCUMENT"]),
          {
            ...job("link", "drive-d", ["ADD_RELATIONSHIP"]),
            dependsOn: ["create"],
          },
        ],
      });

      expect(one.count("executeBatch"), id).toBe(1);
      expect(two.count("executeBatch"), id).toBe(0);
    }
  });
});

describe("a batch that truly spans backends", () => {
  it("names the true holders after a refusal on one id", async () => {
    for (let i = 0; i < 20; i++) {
      const a = `doc-a${i}`;
      const b = `doc-b${i}`;
      const one = new FakeBackend("one");
      const two = new FakeBackend("two");
      one.seed(fakeDocument({ id: a }));
      two.seed(fakeDocument({ id: b }));
      const client = router([one.config(), two.config()], {
        documents: { [b]: "one" },
      });

      const run = client.executeBatch({ jobs: [job("a", a), job("b", b)] });

      await expect(run, `${a}, ${b}`).rejects.toThrow(`${a}@one, ${b}@two`);
      expect(one.count("executeBatch") + two.count("executeBatch")).toBe(0);
    }
  });
});

type Row = {
  readonly rule: string;
  /** Which backends hold each id. */
  readonly holds: Record<string, string[]>;
  readonly ids: string[];
  readonly created?: string[];
  readonly excluded?: Record<string, string[]>;
  readonly documents?: Record<string, string>;
  /** A backend name, or the placements a CrossBackendBatchError names. */
  readonly expected: string;
};

function dispatcherFor(row: Pick<Row, "holds" | "documents">) {
  const fakes = ["one", "two", "three"].map((name) => new FakeBackend(name));
  for (const [id, holders] of Object.entries(row.holds)) {
    for (const fake of fakes.filter((f) => holders.includes(f.name))) {
      fake.seed(fakeDocument({ id }));
    }
  }
  const dispatcher = new RouteDispatcher(
    fakes.map((fake) => fake.handle()),
    { onDiagnostic: silent, documents: row.documents ?? {} },
  );
  return { fakes, dispatcher };
}

const rows: Row[] = [
  {
    rule: "1: an existing id resolves to its holder",
    holds: { a: ["two"], b: ["two"] },
    ids: ["a", "b"],
    expected: "two",
  },
  {
    rule: "1: a cached route is used without probing",
    holds: { a: ["two"] },
    ids: ["a"],
    documents: { a: "three" },
    expected: "three",
  },
  {
    rule: "1: a backend excluded for an id is skipped for that id",
    holds: { a: ["one", "two"], b: ["two"] },
    ids: ["a", "b"],
    excluded: { a: ["one"] },
    expected: "two",
  },
  {
    rule: "1: a backend excluded for one id still holds the others",
    holds: { a: ["one"], b: ["one", "two"] },
    ids: ["a", "b"],
    excluded: { b: ["one"] },
    expected: "CrossBackendBatchError a@one, b@two",
  },
  {
    rule: "2: existing ids on two holders name both",
    holds: { a: ["one"], b: ["two"] },
    ids: ["a", "b"],
    expected: "CrossBackendBatchError a@one, b@two",
  },
  {
    rule: "2: an id served only by an excluded backend is reported there",
    holds: { a: ["one"], b: ["two"] },
    ids: ["a", "b"],
    excluded: { b: ["two"] },
    expected: "CrossBackendBatchError a@one, b@two",
  },
  {
    rule: "2: an id served only by an excluded backend keeps the batch there",
    holds: { a: ["two"] },
    ids: ["a"],
    excluded: { a: ["two"] },
    expected: "two",
  },
  {
    rule: "3: created ids follow the existing ids' holder",
    holds: { parent: ["three"] },
    ids: ["c0", "c1", "c2", "c3", "parent"],
    created: ["c0", "c1", "c2", "c3"],
    expected: "three",
  },
  {
    rule: "3: a created id held elsewhere does not choose the backend",
    holds: { parent: ["three"], c: ["one"] },
    ids: ["c", "parent"],
    created: ["c"],
    expected: "three",
  },
  {
    rule: "3: a stale route for a created id does not choose the backend",
    holds: { parent: ["two"] },
    ids: ["c", "parent"],
    created: ["c"],
    documents: { c: "one" },
    expected: "two",
  },
];

describe("resolveBatchBackend rules", () => {
  for (const row of rows) {
    it(row.rule, async () => {
      const { dispatcher } = dispatcherFor(row);
      const excluded = new Map(
        Object.entries(row.excluded ?? {}).map(([id, names]) => [
          id,
          new Set(names),
        ]),
      );

      const outcome = await dispatcher
        .resolveBatchBackend(
          "executeBatch",
          row.ids,
          new Set(row.created ?? []),
          excluded,
        )
        .then(
          (backend) => backend.name,
          (error: Error) =>
            error instanceof CrossBackendBatchError
              ? `CrossBackendBatchError ${error.placement
                  .map((entry) => `${entry.documentId}@${entry.backend}`)
                  .join(", ")}`
              : error.name,
        );

      expect(outcome).toBe(row.expected);
    });
  }

  it("3: places a batch that creates every id by its first id", async () => {
    for (const first of ids("new")) {
      const { dispatcher } = dispatcherFor({ holds: {} });
      const placed = await dispatcher.placeDocument(first);

      const backend = await dispatcher.resolveBatchBackend(
        "executeBatch",
        [first, "other"],
        new Set([first, "other"]),
      );

      expect(backend.name, first).toBe(placed.name);
    }
  });

  it("3: places a batch that creates every id off a backend any id refused", async () => {
    for (const first of ids("new")) {
      const { dispatcher } = dispatcherFor({ holds: {} });
      const placed = await dispatcher.placeDocument(first);

      const backend = await dispatcher.resolveBatchBackend(
        "executeBatch",
        [first, "other"],
        new Set([first, "other"]),
        new Map([["other", new Set([placed.name])]]),
      );

      expect(backend.name, first).not.toBe(placed.name);
    }
  });
});

describe("the batch ownership guard", () => {
  const created = (holds: Record<string, string[]>, refuses: boolean) => {
    const { fakes } = dispatcherFor({ holds });
    for (const fake of fakes) {
      fake.refuses = refuses;
    }
    return { fakes, client: router(fakes.map((fake) => fake.config())) };
  };

  it("4: creates when another backend cannot answer, and nothing holds it", async () => {
    const { fakes, client } = created({}, false);
    fakes[1].failing.add("isServed");
    const placed = await new RouteDispatcher(
      fakes.map((fake) => fake.handle()),
      { onDiagnostic: silent },
    ).placeDocument("fresh");

    await client.executeBatch({
      jobs: [job("c", "fresh", ["CREATE_DOCUMENT"])],
    });

    const landed = fakes.find((fake) => fake.count("executeBatch") === 1);
    expect(landed?.name).toBe(placed.name);
  });

  for (const refuses of [false, true]) {
    it(`4: refuses a create held elsewhere and lands it on the holder (${refuses ? "refusing" : "non-refusing"})`, async () => {
      for (const id of ids("held")) {
        const { fakes, client } = created({ [id]: ["three"] }, refuses);

        await client.executeBatch({
          jobs: [job("c", id, ["CREATE_DOCUMENT"])],
        });

        expect(
          fakes.map((fake) => fake.count("executeBatch")),
          id,
        ).toEqual([0, 0, 1]);
      }
    });
  }

  it("5: excludes a refusing backend only for the id it refused", async () => {
    const one = new FakeBackend("one");
    const two = new FakeBackend("two");
    one.refuses = true;
    two.refuses = true;
    one.seed(fakeDocument({ id: "a" }));
    one.seed(fakeDocument({ id: "b" }));
    two.seed(fakeDocument({ id: "b" }));
    const config = one.config();
    let refused = 0;
    const refuseOnce: typeof config.backend.executeBatch = (request) => {
      if (refused++ > 0) {
        return config.backend.executeBatch(request);
      }
      return Promise.reject(
        new WrongBackendError({
          documentId: "b",
          rejectedBy: "one",
          operation: "executeBatch",
        }),
      );
    };
    const client = router([
      { ...config, backend: { ...config.backend, executeBatch: refuseOnce } },
      two.config(),
    ]);

    const run = client.executeBatch({ jobs: [job("a", "a"), job("b", "b")] });

    await expect(run).rejects.toThrow("a@one, b@two");
    expect(refused).toBe(1);
  });
});
