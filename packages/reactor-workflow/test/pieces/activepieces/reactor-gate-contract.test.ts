// The pieces/reactor contract, both sides at once (testing policy R1/R6):
// the author-shaped piece from pieces-framework/test/author.test.ts — an
// action and a POLLING trigger that both call reactorOf(ctx) — run through
// the REAL host gates (ActivepiecesBlockExecutor for steps, TriggerSupervisor
// for trigger hooks) and the REAL worker context construction, not a
// fabricated ctx.

// The contract under test: exactly the packages servesReactorPort admits
// receive a working ctx.reactor, in actions AND triggers alike; every other
// package gets the typed UnsupportedContextMemberError refusal by member
// name — never a bare TypeError from a missing context key.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActivepiecesBlockExecutor,
  REACTOR_PORT_PIECE,
  servesReactorPort,
  type ReactorPort,
} from "../../../src/pieces/engine/blocks.js";
import type { PieceResolver } from "../../../src/pieces/activepieces/resolver.js";
import {
  stepBlock,
  type BlockExecution,
} from "../../../src/pieces/engine/types.js";
import {
  PieceWorker,
  PieceWorkerError,
} from "../../../src/pieces/activepieces/worker/host.js";
import {
  TriggerSupervisor,
  type PieceTriggerBinding,
  type TriggerSupervisorOptions,
} from "../../../src/reactor/trigger-supervisor.js";

// The author.test.ts piece shapes, as a worker-loadable module. reactorOf is
// inlined verbatim from @powerhousedao/pieces-framework: the fixture runs in
// the worker child, where the framework package is not resolvable from a
// temp directory. Its access pattern is the contract: read ctx.reactor, then
// call a method on it.
const AUTHOR_FIXTURE = `
function reactorOf(ctx) {
  const reactor =
    ctx !== null && typeof ctx === "object" ? ctx.reactor : undefined;
  if (!reactor) {
    throw new Error(
      "ctx.reactor is not available: this piece is not running on a Powerhouse reactor",
    );
  }
  return reactor;
}

async function poll(ctx) {
  const seen = (await ctx.store.get("seen")) ?? [];
  const documents = await reactorOf(ctx).find({
    documentType: ctx.propsValue.documentType,
  });
  await ctx.store.put("seen", documents.map((d) => d.documentId));
  return documents.filter((d) => !seen.includes(d.documentId));
}

const app = {
  displayName: "Invoices",
  actions: {
    list_documents: {
      name: "list_documents",
      displayName: "List documents",
      props: {},
      run: async (ctx) =>
        reactorOf(ctx).find({ documentType: ctx.propsValue.documentType }),
    },
  },
  triggers: {
    new_document: {
      name: "new_document",
      displayName: "New document",
      type: "POLLING",
      props: {},
      onEnable: async (ctx) => {
        await ctx.store.put("seen", []);
      },
      onDisable: async (ctx) => {
        await ctx.store.delete("seen");
      },
      run: poll,
      test: poll,
    },
  },
};
module.exports = { app };
`;

const documents = [
  { documentId: "doc-1", documentType: "powerhouse/invoice", name: "One" },
  { documentId: "doc-2", documentType: "powerhouse/invoice", name: "Two" },
];

// A third-party package name, the shape the bug report ran as.
const THIRD_PARTY = "@acme/invoices";

let cacheDir = "";
let entryPath = "";
let worker: PieceWorker;

// Serves the SAME module file under any package name: the gate must decide
// on identity, not on what code the bundle holds.
const sameCodeResolver: PieceResolver = {
  resolve({ name, version }) {
    return Promise.resolve({ name, version, entryPath, local: true });
  },
};

function reactorPort(): ReactorPort & { finds: unknown[] } {
  const finds: unknown[] = [];
  const unused = () => Promise.reject(new Error("not under test"));
  return {
    finds,
    models: () => Promise.resolve([]),
    model: unused,
    get: unused,
    find(input) {
      finds.push(input);
      return Promise.resolve(documents);
    },
    submit: unused,
    submitCreate: unused,
    wait: unused,
  };
}

function execution(pieceName: string): BlockExecution {
  const step = {
    id: "s1",
    key: "step",
    pieceName,
    pieceVersion: "1.0.0",
    actionName: "list_documents",
    config: { documentType: "powerhouse/invoice" },
  };
  return {
    block: stepBlock(step),
    config: { documentType: "powerhouse/invoice" },
    step,
  };
}

function triggerBinding(packageName: string): PieceTriggerBinding {
  return {
    workflowId: "wf-contract",
    block: {
      pieceName: packageName,
      pieceVersion: "1.0.0",
      kind: "trigger",
      name: "new_document",
    },
    packageName,
    version: "1.0.0",
    triggerName: "new_document",
    config: { documentType: "powerhouse/invoice" },
    connectionId: null,
  };
}

function supervisor(reactor?: ReactorPort): TriggerSupervisor {
  const options: TriggerSupervisorOptions = {
    // No journal: a design-time sample (hook "test") is the one hook allowed
    // to run without one, which keeps this harness PGlite-free.
    store: () => Promise.resolve(undefined),
    resolveAuth: () => Promise.resolve(undefined),
    fire: () => undefined,
    cacheDir,
    resolver: sameCodeResolver,
    worker,
    ...(reactor ? { reactor } : {}),
  };
  return new TriggerSupervisor(options);
}

// The typed refusal, as it crosses the worker boundary: classifiable by
// field, named by member — the conformance-time shape, not a TypeError.
function expectTypedRefusal(error: unknown): void {
  expect(error).toBeInstanceOf(PieceWorkerError);
  const serialized = (error as PieceWorkerError).serialized;
  expect(serialized.unsupportedMember).toBe("reactor.find");
  expect(serialized.name).toBe("UnsupportedContextMemberError");
  expect(serialized.name).not.toBe("TypeError");
}

describe("pieces/reactor contract through the real gates", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "ap-reactor-gate-"));
    entryPath = join(cacheDir, "author-piece.js");
    await writeFile(entryPath, AUTHOR_FIXTURE);
    worker = new PieceWorker();
  });

  afterAll(async () => {
    worker.dispose();
    await rm(cacheDir, { recursive: true, force: true });
  });

  // One rule, one place: every gate site (the action executor, the trigger
  // supervisor, design-time property resolution) calls this predicate, so a
  // future capability mechanism changes one function.
  it("servesReactorPort is the single admission rule", () => {
    expect(servesReactorPort(REACTOR_PORT_PIECE)).toBe(true);
    expect(servesReactorPort("@powerhousedao/piece-reactor")).toBe(true);
    expect(servesReactorPort(THIRD_PARTY)).toBe(false);
    expect(servesReactorPort("@powerhousedao/distyra-piece")).toBe(false);
    // A prefix or suffix of the name is not the name.
    expect(servesReactorPort("@powerhousedao/piece-reactor-extras")).toBe(
      false,
    );
  });

  it("the admitted package's action receives a working reactor", async () => {
    const port = reactorPort();
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      resolver: sameCodeResolver,
      reactor: port,
    });

    const result = await executor.execute(execution(REACTOR_PORT_PIECE));

    expect(result.output).toEqual(documents);
    expect(port.finds).toEqual([{ documentType: "powerhouse/invoice" }]);
  });

  it("the admitted package's trigger receives the same reactor", async () => {
    const port = reactorPort();

    const output = await supervisor(port).test(
      triggerBinding(REACTOR_PORT_PIECE),
    );

    // First poll over an empty test-partition store: every document is new,
    // and the content comes from the host's port, not a fabricated ctx.
    expect(output).toEqual(documents);
    expect(port.finds).toEqual([{ documentType: "powerhouse/invoice" }]);
  });

  it("a third-party action gets the typed refusal, not a TypeError", async () => {
    const port = reactorPort();
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      resolver: sameCodeResolver,
      reactor: port,
    });

    const failure = await executor.execute(execution(THIRD_PARTY)).then(
      () => undefined,
      (error: unknown) => error,
    );

    expectTypedRefusal(failure);
    expect(port.finds).toEqual([]);
  });

  it("a third-party trigger gets the same typed refusal", async () => {
    const port = reactorPort();

    const failure = await supervisor(port)
      .test(triggerBinding(THIRD_PARTY))
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expectTypedRefusal(failure);
    expect(port.finds).toEqual([]);
  });

  it("keeps the trigger member throwing when no port is configured", async () => {
    const failure = await supervisor(undefined)
      .test(triggerBinding(REACTOR_PORT_PIECE))
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expectTypedRefusal(failure);
  });
});
