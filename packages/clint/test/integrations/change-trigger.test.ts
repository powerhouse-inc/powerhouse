// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect, vi } from "vitest";
import { createDocumentChangeTrigger } from "../../src/integrations/powerhouse/change-trigger.js";
import { isDocType } from "../../src/integrations/powerhouse/type-guard.js";
import { createEventBus } from "../../src/core/events.js";
import type {
  TriggerContext,
  CoreContext,
  WorkItem,
} from "../../src/core/types.js";
import type { ReactorContext } from "../../src/integrations/powerhouse/types.js";

// ── Fixture helpers ──────────────────────────────────────────────

interface FakeDoc {
  header: { id: string; documentType: string };
  state: { global: { name: string } };
}

function makeReactor(
  docs: Record<string, FakeDoc>,
  findResults?: FakeDoc[],
): ReactorContext {
  return {
    client: {
      get: async (id: string) => docs[id],
      find: async () => ({ results: findResults ?? [] }),
    } as any,
    driveId: "drive-1",
    async shutdown() {},
  };
}

interface HarnessOptions {
  withBus?: boolean;
  reactor?: ReactorContext | null;
}

function makeContext<TState>(opts: HarnessOptions = {}): {
  ctx: TriggerContext<TState>;
  emit: (event: string, data: unknown) => void;
} {
  const bus = opts.withBus !== false ? createEventBus() : undefined;
  const reactorAccessor = async () =>
    opts.reactor === null ? undefined : (opts.reactor ?? undefined);
  const agentAccessor = async () => undefined;
  const core: CoreContext = {
    workdir: "/tmp/test",
    workspace: {} as any,
    config: {},
    stdout: () => {},
    runProcess: async () => ({ success: true, output: "" }),
    on: bus?.on,
    emit: bus?.emit,
  };
  const ctx: TriggerContext<TState> = {
    context: core,
    get commandContext() {
      return { ...core, reactor: reactorAccessor, agent: agentAccessor };
    },
    state: undefined as any,
    reactor: reactorAccessor,
    agent: agentAccessor,
  };
  return {
    ctx,
    emit: bus
      ? (event, data) => (bus.emit as any)(event, data)
      : () => {
          throw new Error("no event bus configured");
        },
  };
}

function initState<TState>(
  trigger: { state?: () => TState },
  ctx: TriggerContext<TState>,
): TriggerContext<TState> {
  ctx.state = trigger.state ? trigger.state() : ({} as TState);
  return ctx;
}

// ── Tests ────────────────────────────────────────────────────────

describe("createDocumentChangeTrigger", () => {
  it("fires onChange with [doc] when a matching-type event arrives and documentId matches (string form)", async () => {
    const doc: FakeDoc = {
      header: { id: "doc-1", documentType: "test/doc" },
      state: { global: { name: "Alice" } },
    };
    const work: WorkItem = { type: "function", params: { fn: () => {} } };
    const onChange = vi.fn<(docs: FakeDoc[]) => Promise<WorkItem | null>>(
      async () => work,
    );

    const trigger = createDocumentChangeTrigger({
      id: "watch",
      documentType: "test/doc",
      documentId: "doc-1",
      initialReconcile: false,
      onChange: onChange as any,
    });

    const { ctx, emit } = makeContext<{ pending: number }>();
    initState(trigger, ctx);

    await trigger.setup!(ctx);
    emit("powerhouse:document:changed", {
      changeType: "updated",
      documents: [doc],
    });
    expect(ctx.state.pending).toBe(1);

    const reactorCtx = makeReactor({ "doc-1": doc });
    ctx.reactor = async () => reactorCtx;

    const result = await trigger.poll(ctx);
    expect(result).toBe(work);
    expect(onChange).toHaveBeenCalledTimes(1);
    const [docs1, ctx1] = onChange.mock.calls[0] as [
      FakeDoc[],
      TriggerContext<any>,
    ];
    expect(docs1).toEqual([doc]);
    expect(ctx1).toBe(ctx);
    expect(ctx.state.pending).toBe(0);
  });

  it("ignores events whose documentType does not match", async () => {
    const onChange = vi.fn();
    const trigger = createDocumentChangeTrigger({
      id: "watch",
      documentType: "test/doc",
      initialReconcile: false,
      onChange: onChange as any,
    });

    const { ctx, emit } = makeContext<{ pending: number }>();
    initState(trigger, ctx);

    await trigger.setup!(ctx);
    emit("powerhouse:document:changed", {
      changeType: "updated",
      documents: [{ header: { id: "x", documentType: "other/doc" } }],
    });
    expect(ctx.state.pending).toBe(0);

    const result = await trigger.poll(ctx);
    expect(result).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores events whose documentId does not match (literal-string form)", async () => {
    const onChange = vi.fn();
    const trigger = createDocumentChangeTrigger({
      id: "watch",
      documentType: "test/doc",
      documentId: "doc-1",
      initialReconcile: false,
      onChange: onChange as any,
    });

    const { ctx, emit } = makeContext<{ pending: number }>();
    initState(trigger, ctx);

    await trigger.setup!(ctx);
    emit("powerhouse:document:changed", {
      changeType: "updated",
      documents: [{ header: { id: "doc-2", documentType: "test/doc" } }],
    });
    expect(ctx.state.pending).toBe(0);
  });

  it("resolves documentId via function on poll", async () => {
    const doc: FakeDoc = {
      header: { id: "resolved", documentType: "test/doc" },
      state: { global: { name: "Bob" } },
    };
    const onChange = vi.fn<(docs: FakeDoc[]) => Promise<WorkItem | null>>(
      async () => null,
    );

    const trigger = createDocumentChangeTrigger({
      id: "watch",
      documentType: "test/doc",
      documentId: async () => "resolved",
      initialReconcile: false,
      onChange: onChange as any,
    });

    const { ctx, emit } = makeContext<{ pending: number }>();
    initState(trigger, ctx);
    ctx.reactor = async () => makeReactor({ resolved: doc });

    await trigger.setup!(ctx);
    emit("powerhouse:document:changed", {
      changeType: "updated",
      documents: [{ header: { id: "any", documentType: "test/doc" } }],
    });

    await trigger.poll(ctx);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0] as unknown[])[0]).toEqual([doc]);
  });

  it("returns null when documentId function returns undefined", async () => {
    const onChange = vi.fn();
    const trigger = createDocumentChangeTrigger({
      id: "watch",
      documentType: "test/doc",
      documentId: async () => undefined,
      initialReconcile: true,
      onChange: onChange as any,
    });

    const { ctx } = makeContext<{ pending: number }>();
    initState(trigger, ctx);
    ctx.reactor = async () => makeReactor({});

    await trigger.setup!(ctx);
    expect(ctx.state.pending).toBe(1);

    const result = await trigger.poll(ctx);
    expect(result).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(ctx.state.pending).toBe(0);
  });

  it("skips when filter returns false for all docs", async () => {
    const doc: FakeDoc = {
      header: { id: "doc-1", documentType: "test/doc" },
      state: { global: { name: "Carol" } },
    };
    const onChange = vi.fn();
    const filter = vi.fn<(d: FakeDoc) => boolean>(() => false);

    const trigger = createDocumentChangeTrigger({
      id: "watch",
      documentType: "test/doc",
      documentId: "doc-1",
      initialReconcile: true,
      filter: filter as any,
      onChange: onChange as any,
    });

    const { ctx } = makeContext<{ pending: number }>();
    initState(trigger, ctx);
    ctx.reactor = async () => makeReactor({ "doc-1": doc });

    await trigger.setup!(ctx);
    const result = await trigger.poll(ctx);
    expect(result).toBeNull();
    expect(filter).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("bumps pending to 1 on setup when initialReconcile is default (true)", async () => {
    const trigger = createDocumentChangeTrigger({
      id: "watch",
      documentType: "test/doc",
      onChange: async () => null,
    });

    const { ctx } = makeContext<{ pending: number }>();
    initState(trigger, ctx);

    await trigger.setup!(ctx);
    expect(ctx.state.pending).toBe(1);
  });

  it("does not bump pending when initialReconcile is false", async () => {
    const trigger = createDocumentChangeTrigger({
      id: "watch",
      documentType: "test/doc",
      initialReconcile: false,
      onChange: async () => null,
    });

    const { ctx } = makeContext<{ pending: number }>();
    initState(trigger, ctx);

    await trigger.setup!(ctx);
    expect(ctx.state.pending).toBe(0);
  });

  it("coalesces multiple events in a tick into one onChange call", async () => {
    const doc: FakeDoc = {
      header: { id: "doc-1", documentType: "test/doc" },
      state: { global: { name: "Dan" } },
    };
    const onChange = vi.fn<(docs: FakeDoc[]) => Promise<WorkItem | null>>(
      async () => null,
    );

    const trigger = createDocumentChangeTrigger({
      id: "watch",
      documentType: "test/doc",
      documentId: "doc-1",
      initialReconcile: false,
      onChange: onChange as any,
    });

    const { ctx, emit } = makeContext<{ pending: number }>();
    initState(trigger, ctx);
    ctx.reactor = async () => makeReactor({ "doc-1": doc });

    await trigger.setup!(ctx);
    emit("powerhouse:document:changed", {
      changeType: "updated",
      documents: [doc],
    });
    emit("powerhouse:document:changed", {
      changeType: "updated",
      documents: [doc],
    });
    emit("powerhouse:document:changed", {
      changeType: "updated",
      documents: [doc],
    });
    expect(ctx.state.pending).toBe(3);

    await trigger.poll(ctx);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(ctx.state.pending).toBe(0);
  });

  it("runs in poll-only mode when no event bus is present", async () => {
    const trigger = createDocumentChangeTrigger({
      id: "watch",
      documentType: "test/doc",
      onChange: async () => null,
    });

    const { ctx } = makeContext<{ pending: number }>({ withBus: false });
    initState(trigger, ctx);

    await trigger.setup!(ctx);
    // initialReconcile path still works.
    expect(ctx.state.pending).toBe(1);
  });

  it("poll returns null gracefully when no reactor is available", async () => {
    const trigger = createDocumentChangeTrigger({
      id: "watch",
      documentType: "test/doc",
      documentId: "doc-1",
      onChange: async () => null,
    });

    const { ctx } = makeContext<{ pending: number }>({ reactor: null });
    initState(trigger, ctx);

    await trigger.setup!(ctx);
    expect(ctx.state.pending).toBe(1);

    const result = await trigger.poll(ctx);
    expect(result).toBeNull();
    expect(ctx.state.pending).toBe(0);
  });

  it("uses custom state initializer when supplied", async () => {
    const trigger = createDocumentChangeTrigger<
      Record<string, never>,
      "test/doc",
      Record<string, unknown>,
      { pending: number; lastSeen: number }
    >({
      id: "watch",
      documentType: "test/doc",
      initialReconcile: false,
      state: () => ({ pending: 0, lastSeen: 42 }),
      onChange: async () => null,
    });

    const { ctx } = makeContext<{ pending: number; lastSeen: number }>();
    initState(trigger, ctx);

    expect(ctx.state).toEqual({ pending: 0, lastSeen: 42 });
    await trigger.setup!(ctx);
    expect(ctx.state.lastSeen).toBe(42);
  });

  // ── Multi-type tests ────────────────────────────────────────────

  it("accepts an array of document types and matches any of them", async () => {
    const onChange = vi.fn<() => Promise<WorkItem | null>>(async () => null);

    const trigger = createDocumentChangeTrigger({
      id: "multi",
      documentType: ["type/a", "type/b"],
      initialReconcile: false,
      onChange: onChange as any,
    });

    const { ctx, emit } = makeContext<{ pending: number }>();
    initState(trigger, ctx);

    await trigger.setup!(ctx);

    // type/a matches
    emit("powerhouse:document:changed", {
      changeType: "updated",
      documents: [{ header: { id: "1", documentType: "type/a" } }],
    });
    expect(ctx.state.pending).toBe(1);

    // type/b matches
    emit("powerhouse:document:changed", {
      changeType: "updated",
      documents: [{ header: { id: "2", documentType: "type/b" } }],
    });
    expect(ctx.state.pending).toBe(2);

    // type/c does NOT match
    emit("powerhouse:document:changed", {
      changeType: "updated",
      documents: [{ header: { id: "3", documentType: "type/c" } }],
    });
    expect(ctx.state.pending).toBe(2);
  });

  // ── Multi-doc (no documentId) tests ─────────────────────────────

  it("loads all matching docs via find() when documentId is omitted", async () => {
    const docA: FakeDoc = {
      header: { id: "a", documentType: "test/doc" },
      state: { global: { name: "A" } },
    };
    const docB: FakeDoc = {
      header: { id: "b", documentType: "test/doc" },
      state: { global: { name: "B" } },
    };
    const onChange = vi.fn<(docs: FakeDoc[]) => Promise<WorkItem | null>>(
      async () => null,
    );

    const trigger = createDocumentChangeTrigger({
      id: "multi-doc",
      documentType: "test/doc",
      initialReconcile: true,
      onChange: onChange as any,
    });

    const { ctx } = makeContext<{ pending: number }>();
    initState(trigger, ctx);
    ctx.reactor = async () => makeReactor({}, [docA, docB]);

    await trigger.setup!(ctx);
    await trigger.poll(ctx);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0] as unknown[])[0]).toEqual([docA, docB]);
  });

  it("returns null from poll when find() returns empty results and no documentId", async () => {
    const onChange = vi.fn();
    const trigger = createDocumentChangeTrigger({
      id: "empty-find",
      documentType: "test/doc",
      initialReconcile: true,
      onChange: onChange as any,
    });

    const { ctx } = makeContext<{ pending: number }>();
    initState(trigger, ctx);
    ctx.reactor = async () => makeReactor({}, []);

    await trigger.setup!(ctx);
    const result = await trigger.poll(ctx);
    expect(result).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("filter removes individual docs from the batch", async () => {
    const docA: FakeDoc = {
      header: { id: "a", documentType: "test/doc" },
      state: { global: { name: "keep" } },
    };
    const docB: FakeDoc = {
      header: { id: "b", documentType: "test/doc" },
      state: { global: { name: "drop" } },
    };
    const onChange = vi.fn<(docs: FakeDoc[]) => Promise<WorkItem | null>>(
      async () => null,
    );
    const filter = vi.fn<(d: FakeDoc) => boolean>(
      (d) => d.state.global.name === "keep",
    );

    const trigger = createDocumentChangeTrigger({
      id: "filtered",
      documentType: "test/doc",
      initialReconcile: true,
      filter: filter as any,
      onChange: onChange as any,
    });

    const { ctx } = makeContext<{ pending: number }>();
    initState(trigger, ctx);
    ctx.reactor = async () => makeReactor({}, [docA, docB]);

    await trigger.setup!(ctx);
    await trigger.poll(ctx);

    expect(filter).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0] as unknown[])[0]).toEqual([docA]);
  });
});

// ── isDocType ─────────────────────────────────────────────────────

describe("isDocType", () => {
  it("returns true when header.documentType matches", () => {
    const doc = { header: { documentType: "test/a" } } as any;
    expect(isDocType(doc, "test/a")).toBe(true);
  });

  it("returns false when header.documentType does not match", () => {
    const doc = { header: { documentType: "test/b" } } as any;
    expect(isDocType(doc, "test/a")).toBe(false);
  });
});
