import type {
  Action,
  ActionSigner,
  DocumentModelDocument,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveOperationId,
  deriveScope,
  documentModelStateReducer,
  retract,
  undo,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InProcessReactorModule } from "../../src/core/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import { synthesizedActionId } from "../../src/executor/synthesized-signing.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import { verifyActionSignature } from "../../src/signer/verify-action-signature.js";
import { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import {
  createBaseReducer3Document,
  createDocModelDocument,
  createUndoV3ReactorBuilder,
} from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";

const REACTOR_USER: ActionSigner["user"] = {
  address: "0xreactor",
  networkId: "eip155",
  chainId: 1,
};

let module: InProcessReactorModule | undefined;
let docId: string;
let created: PHDocument;

afterEach(() => {
  vi.restoreAllMocks();
  module?.reactor.kill();
  module = undefined;
});

async function build(
  options: {
    version?: 1 | 2 | 3;
    batchApplies?: boolean;
    featureFlags?: Partial<ReactorFeatureFlags>;
    signer?: TestP256Signer;
  } = {},
): Promise<void> {
  const { version = 3, batchApplies = true, signer } = options;
  const builder = createUndoV3ReactorBuilder({
    featureFlags: options.featureFlags,
  }).withExecutorConfig({ batchApplies });
  if (signer) {
    builder
      .withExecutorConfig({ signatureVerification: "enforce" })
      .withSigner(signer.asISigner([], REACTOR_USER));
  }
  module = await builder.buildModule();
  created =
    version === 3
      ? createBaseReducer3Document({ signaturePolicy: "legacy" })
      : createDocModelDocument({
          signaturePolicy: "legacy",
          protocolVersions: { "base-reducer": version },
        });
  docId = created.header.id;
  const job = await settle(await module.reactor.create(created));
  expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
}

async function settle(job: JobInfo): Promise<JobInfo> {
  await vi.waitUntil(
    async () => {
      const { status } = await module!.reactor.getJobStatus(job.id);
      return status === JobStatus.READ_READY || status === JobStatus.FAILED;
    },
    { timeout: 10_000 },
  );
  return module!.reactor.getJobStatus(job.id);
}

async function execute(actions: Action[]): Promise<JobInfo> {
  return settle(await module!.reactor.execute(docId, "main", actions));
}

async function executeOk(actions: Action[]): Promise<void> {
  const job = await execute(actions);
  expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
}

async function load(operations: Operation[]): Promise<JobInfo> {
  return settle(await module!.reactor.load(docId, "main", operations));
}

function add(id: string, actionId?: string): Action {
  const action = addModule({ id, name: id });
  return actionId === undefined ? action : { ...action, id: actionId };
}

function asOperation(action: Action, index: number): Operation {
  return {
    id: deriveOperationId(docId, action.scope, "main", action.id),
    index,
    skip: 0,
    hash: "",
    timestampUtcMs: action.timestampUtcMs,
    action,
  };
}

async function stream(): Promise<Operation[]> {
  const result = await module!.reactor.getOperations(docId, {
    branch: "main",
    scopes: ["global"],
  });
  const page = result.global as { results: Operation[] } | undefined;
  return page?.results ?? [];
}

async function moduleIds(): Promise<string[]> {
  const document = await module!.reactor.get<DocumentModelDocument>(docId);
  return document.state.global.specifications[0].modules.map(
    (entry) => entry.id,
  );
}

/** The ids each apply of the global scope wrote, one entry per transaction. */
function globalApplies(): string[][] {
  const applies: string[][] = [];
  const original = KyselyOperationStore.prototype.apply;
  vi.spyOn(KyselyOperationStore.prototype, "apply").mockImplementation(
    function (this: KyselyOperationStore, ...args) {
      const [, , scope, , , fn] = args;
      if (scope === "global") {
        const written: string[] = [];
        applies.push(written);
        args[5] = async (txn) => {
          const addOperations = txn.addOperations.bind(txn);
          txn.addOperations = (...operations) => {
            written.push(...operations.map((operation) => operation.action.id));
            return addOperations(...operations);
          };
          return fn(txn);
        };
      }
      return original.apply(this, args);
    },
  );
  return applies;
}

function expectRefused(job: JobInfo, reason: string): void {
  expect(job.status).toBe(JobStatus.FAILED);
  expect(job.error?.name).toBe("RetractionRefusedError");
  expect(job.error?.message).toContain(reason);
  expect(job.job?.retryCount ?? 0).toBe(0);
}

describe("base-reducer 3: RETRACT admission", () => {
  it("applies a submitted RETRACT against every row, not the cached slice", async () => {
    await build();
    await executeOk([add("a")]);
    await executeOk([add("b")]);
    const [, b] = await stream();

    await executeOk([retract(b.action.id)]);

    expect(await moduleIds()).toEqual(["a"]);
  });

  it("refuses a RETRACT whose target is absent and writes nothing", async () => {
    await build();
    await executeOk([add("a")]);
    const before = await stream();

    expectRefused(await execute([retract("missing")]), "target-missing");

    expect(await stream()).toEqual(before);
    expect(await moduleIds()).toEqual(["a"]);
  });

  it("refuses a RETRACT that names itself", async () => {
    await build();
    await executeOk([add("a")]);
    const self = retract("placeholder");
    const action = { ...self, input: { target: self.id } };

    expectRefused(await execute([action]), "target-missing");
  });

  it("refuses a RETRACT of a row already retracted", async () => {
    await build();
    await executeOk([add("a")]);
    const [a] = await stream();
    await executeOk([retract(a.action.id)]);
    const before = await stream();

    expectRefused(await execute([retract(a.action.id)]), "target-retracted");

    expect(await stream()).toEqual(before);
  });

  it("admits a RETRACT of a row a retracted retraction left live", async () => {
    await build();
    await executeOk([add("a")]);
    const [a] = await stream();
    const first = retract(a.action.id);
    await executeOk([first]);
    await executeOk([retract(first.id)]);
    expect(await moduleIds()).toEqual(["a"]);
    const named = await module!.operationStore.findRetractionsOf(
      docId,
      "global",
      "main",
      [a.action.id],
    );
    expect([...named]).toEqual([a.action.id]);

    await executeOk([retract(a.action.id)]);

    expect(await moduleIds()).toEqual([]);
  });

  it("admits a RETRACT of a row written earlier in the same job", async () => {
    await build();
    const a = add("a");

    await executeOk([add("b"), a, retract(a.id)]);

    expect(await moduleIds()).toEqual(["b"]);
  });

  it("rolls back the job's earlier writes when a RETRACT is refused", async () => {
    await build();

    expectRefused(
      await execute([add("a"), retract("missing")]),
      "target-missing",
    );

    expect(await stream()).toEqual([]);
  });

  it("admits a loaded RETRACT whose target is absent", async () => {
    await build();
    await executeOk([add("a")]);

    const job = await load([asOperation(retract("missing"), 1)]);

    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    expect(await moduleIds()).toEqual(["a"]);
  });

  it("re-derives a write a stored RETRACT names", async () => {
    await build();
    await executeOk([add("a")]);
    const x = add("x");
    const loaded = await load([asOperation(retract(x.id), 1)]);
    expect(loaded.status).toBe(JobStatus.READ_READY);
    // Leaves the cache holding a slice without the RETRACT.
    await executeOk([add("b")]);

    await executeOk([x]);

    expect(await moduleIds()).toEqual(["a", "b"]);
    const derived = deriveScope(
      created,
      await stream(),
      () => documentModelStateReducer as never,
    ).document as DocumentModelDocument;
    expect(
      derived.state.global.specifications[0].modules.map((entry) => entry.id),
    ).toEqual(["a", "b"]);
  });

  it("never batches a RETRACT", async () => {
    await build();
    const applies = globalApplies();
    const a = add("a");

    await executeOk([add("b"), add("c")]);
    await executeOk([a, retract(a.id)]);

    expect(applies.map((ids) => ids.length)).toEqual([2, 1, 1]);
    expect(await moduleIds()).toEqual(["b", "c"]);
  });

  it("applies a batch one write at a time when a stored RETRACT names a later write", async () => {
    await build();
    await executeOk([add("a")]);
    const x = add("x");
    expect((await load([asOperation(retract(x.id), 1)])).status).toBe(
      JobStatus.READ_READY,
    );
    const applies = globalApplies();

    await executeOk([add("c"), x]);

    expect(applies.map((ids) => ids.length)).toEqual([1, 1]);
    expect(await moduleIds()).toEqual(["a", "c"]);
  });

  it("stores the RETRACT an UNDO becomes signed by the reactor under the derived id", async () => {
    const reactorKey = await TestP256Signer.create();
    await build({ signer: reactorKey });
    await executeOk([add("a")]);
    await executeOk([add("b")]);
    const [, b] = await stream();
    const submitted = undo();

    await executeOk([submitted]);

    const operation = (await stream()).at(-1)!;
    expect(operation.action.type).toBe("RETRACT");
    expect(operation.action.input).toEqual({ target: b.action.id });
    expect(operation.action.id).toBe(
      synthesizedActionId(submitted.id, "suffixed"),
    );
    expect(operation.id).toBe(
      deriveOperationId(docId, "global", "main", operation.action.id),
    );
    const signer = operation.action.context?.signer;
    expect(signer?.app.key).toBe(reactorKey.did);
    expect(signer?.signatures).toHaveLength(1);
    expect(
      await verifyActionSignature(
        operation.action,
        { documentId: docId, branch: "main" },
        "load",
        operation,
      ),
    ).toEqual({ ok: true, scheme: "v2" });
    expect(await moduleIds()).toEqual(["a"]);

    const replayed = await execute([submitted]);
    expect(replayed.status).toBe(JobStatus.FAILED);
    expect(replayed.error?.message).toContain("[DUPLICATE_ACTION]");
    expect((await stream()).length).toBe(3);
  });
});

describe.each([1, 2] as const)("base-reducer %i", (version) => {
  it("never asks which rows a RETRACT names, and batches and undoes as before", async () => {
    await build({ version });
    const named = vi.spyOn(KyselyOperationStore.prototype, "findRetractionsOf");
    const applies = globalApplies();

    await executeOk([add("a"), add("b")]);
    await executeOk([undo()]);

    expect(named).not.toHaveBeenCalled();
    expect(applies.map((ids) => ids.length)).toEqual([2, 1]);
    expect((await stream()).at(-1)!.action.type).toBe("NOOP");
    expect(await moduleIds()).toEqual(["a"]);
  });
});
