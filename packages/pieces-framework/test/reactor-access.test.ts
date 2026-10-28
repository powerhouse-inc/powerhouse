import type {
  IDriveClient,
  IDriveWriteClient,
  IReactorClient,
  IReactorWriteClient,
} from "@powerhousedao/reactor";
import { setName } from "@powerhousedao/shared/document-model";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  assertActionsApplied,
  createAction,
  createPiece,
  createTrigger,
  deniedActionIndexes,
  DocumentModelUnavailableError,
  PieceAuth,
  Property,
  ReactorAccessDeniedError,
  ReactorActionsFailedError,
  ReactorJobFailedError,
  ReactorJobPendingError,
  ReactorRequestClosedError,
  TriggerStrategy,
  type DriveReadMethods,
  type DriveWriteMethods,
  type PropertyContext,
  type ReactorClient,
  type ReactorReadClient,
  type ReadMethods,
  type WriteHalfMethods,
  type WriteMethods,
} from "../src/index.js";
import type {
  Listed,
  UnlistedDriveMethods,
  UnlistedMethods,
  UnlistedWriteHalfMethods,
} from "../src/powerhouse/reactor-client.js";

describe("requireReactor", () => {
  it("rides on the action and trigger, and is absent when undeclared", () => {
    const write = createAction({
      name: "archive",
      displayName: "Archive",
      description: "",
      auth: PieceAuth.None(),
      requireReactor: "write",
      props: { id: Property.ShortText({ displayName: "Id", required: true }) },
      async run(ctx) {
        expectTypeOf(ctx.reactor).toEqualTypeOf<ReactorClient>();
        expectTypeOf(ctx.propsValue.id).toEqualTypeOf<string>();
        const doc = await ctx.reactor.get(ctx.propsValue.id);
        return ctx.reactor.execute(doc.header.id, "main", [
          setName("Archived"),
        ]);
      },
    });
    const read = createAction({
      name: "peek",
      displayName: "Peek",
      description: "",
      auth: PieceAuth.None(),
      requireReactor: "read",
      props: {},
      async run(ctx) {
        expectTypeOf(ctx.reactor).toEqualTypeOf<ReactorReadClient>();
        expectTypeOf(ctx.reactor).not.toHaveProperty("execute");
        return ctx.reactor.get("drive");
      },
    });
    const none = createAction({
      name: "plain",
      displayName: "Plain",
      description: "",
      auth: PieceAuth.None(),
      props: {},
      run(ctx) {
        expectTypeOf(ctx).not.toHaveProperty("reactor");
        return Promise.resolve(null);
      },
    });
    const polling = createTrigger({
      name: "changed",
      displayName: "Changed",
      description: "",
      auth: PieceAuth.None(),
      requireReactor: "read",
      type: TriggerStrategy.POLLING,
      props: {},
      sampleData: {},
      async onEnable(ctx) {
        expectTypeOf(ctx.reactor).toEqualTypeOf<ReactorReadClient>();
        await ctx.store.put("seen", 0);
      },
      onDisable: () => Promise.resolve(),
      run(ctx) {
        expectTypeOf(ctx.reactor).toEqualTypeOf<ReactorReadClient>();
        return Promise.resolve([]);
      },
    });
    const webhook = createTrigger({
      name: "hook",
      displayName: "Hook",
      description: "",
      auth: PieceAuth.None(),
      type: TriggerStrategy.WEBHOOK,
      props: {},
      sampleData: {},
      onEnable(ctx) {
        expectTypeOf(ctx).not.toHaveProperty("reactor");
        expectTypeOf(ctx.webhookUrl).toEqualTypeOf<string>();
        return Promise.resolve();
      },
      onDisable: () => Promise.resolve(),
      run: () => Promise.resolve([]),
    });

    expect(write.requireReactor).toBe("write");
    expect(read.requireReactor).toBe("read");
    expect(polling.requireReactor).toBe("read");
    expect("requireReactor" in none).toBe(false);
    expect("requireReactor" in webhook).toBe(false);
    // Still upstream's blocks: the piece loader and createPiece take them.
    expect(write.requireAuth).toBe(true);
    expect(polling.type).toBe(TriggerStrategy.POLLING);
    const piece = createPiece({
      displayName: "Docs",
      auth: PieceAuth.None(),
      logoUrl: "",
      authors: [],
      actions: [write, read, none],
      triggers: [polling, webhook],
    });
    expect(piece.getAction("archive")?.name).toBe("archive");
    // ph build describes a piece through metadata(), as JSON.
    const metadata = JSON.parse(JSON.stringify(piece.metadata())) as {
      actions: Record<string, { requireReactor?: string }>;
      triggers: Record<string, { requireReactor?: string }>;
    };
    expect(metadata.actions.archive.requireReactor).toBe("write");
    expect(metadata.actions.plain.requireReactor).toBeUndefined();
    expect(metadata.triggers.changed.requireReactor).toBe("read");
  });

  it("carries timeout and retry defaults into metadata", () => {
    const slow = createAction({
      name: "slow",
      displayName: "Slow",
      description: "",
      auth: PieceAuth.None(),
      requireReactor: "write",
      defaultTimeoutSeconds: 300,
      defaultRetry: { maxAttempts: 1 },
      props: {},
      run: () => Promise.resolve(null),
    });
    const plain = createAction({
      name: "plain",
      displayName: "Plain",
      description: "",
      auth: PieceAuth.None(),
      props: {},
      run: () => Promise.resolve(null),
    });
    expect(slow.defaultTimeoutSeconds).toBe(300);
    expect(slow.defaultRetry).toEqual({ maxAttempts: 1 });
    expect("defaultTimeoutSeconds" in plain).toBe(false);
    expect("defaultRetry" in plain).toBe(false);
    const piece = createPiece({
      displayName: "Slow",
      auth: PieceAuth.None(),
      logoUrl: "",
      authors: [],
      actions: [slow, plain],
      triggers: [],
    });
    const metadata = JSON.parse(JSON.stringify(piece.metadata())) as {
      actions: Record<
        string,
        { defaultTimeoutSeconds?: number; defaultRetry?: unknown }
      >;
    };
    expect(metadata.actions.slow.defaultTimeoutSeconds).toBe(300);
    expect(metadata.actions.slow.defaultRetry).toEqual({ maxAttempts: 1 });
    expect(metadata.actions.plain.defaultTimeoutSeconds).toBeUndefined();
    expect(() =>
      createAction({
        name: "bad",
        displayName: "Bad",
        description: "",
        auth: PieceAuth.None(),
        defaultTimeoutSeconds: 0,
        props: {},
        run: () => Promise.resolve(null),
      }),
    ).toThrow(/defaultTimeoutSeconds/);
  });

  it("treats false as no declaration", () => {
    const action = createAction({
      name: "plain",
      displayName: "Plain",
      description: "",
      auth: PieceAuth.None(),
      requireReactor: false,
      props: {},
      run(ctx) {
        expectTypeOf(ctx).not.toHaveProperty("reactor");
        return Promise.resolve(null);
      },
    });
    const trigger = createTrigger({
      name: "tick",
      displayName: "Tick",
      description: "",
      auth: PieceAuth.None(),
      requireReactor: false,
      type: TriggerStrategy.POLLING,
      props: {},
      sampleData: {},
      onEnable(ctx) {
        expectTypeOf(ctx).not.toHaveProperty("reactor");
        return Promise.resolve();
      },
      onDisable: () => Promise.resolve(),
      run: () => Promise.resolve([]),
    });

    expect("requireReactor" in action).toBe(false);
    expect("requireReactor" in trigger).toBe(false);
    const metadata = JSON.parse(
      JSON.stringify(
        createPiece({
          displayName: "Plain",
          auth: PieceAuth.None(),
          logoUrl: "",
          authors: [],
          actions: [action],
          triggers: [trigger],
        }).metadata(),
      ),
    ) as {
      actions: Record<string, { requireReactor?: unknown }>;
      triggers: Record<string, { requireReactor?: unknown }>;
    };
    expect(metadata.actions.plain.requireReactor).toBeUndefined();
    expect(metadata.triggers.tick.requireReactor).toBeUndefined();
  });

  it("refuses a value that is not read, write or false", () => {
    expect(() =>
      createAction({
        name: "bad",
        displayName: "Bad",
        description: "",
        auth: PieceAuth.None(),
        // @ts-expect-error only "read", "write" or false
        requireReactor: "admin",
        props: {},
        run: () => Promise.resolve(null),
      }),
    ).toThrow(/requireReactor must be "read", "write" or false/);
    expect(() =>
      createAction({
        name: "bad",
        displayName: "Bad",
        description: "",
        auth: PieceAuth.None(),
        // @ts-expect-error true is not a declaration
        requireReactor: true,
        props: {},
        run: () => Promise.resolve(null),
      }),
    ).toThrow(/requireReactor must be/);
  });
});

describe("reactor clients", () => {
  it("are subsets of the reactor's own client", () => {
    expectTypeOf<ReactorReadClient["get"]>().toEqualTypeOf<
      IReactorClient["get"]
    >();
    expectTypeOf<ReactorClient["execute"]>().toEqualTypeOf<
      IReactorClient["execute"]
    >();
    expectTypeOf<ReactorClient["executeAsync"]>().toEqualTypeOf<
      IReactorClient["executeAsync"]
    >();
    expectTypeOf<ReactorReadClient>().not.toHaveProperty("execute");
    expectTypeOf<ReactorReadClient>().not.toHaveProperty("executeAsync");
    expectTypeOf<ReactorClient>().not.toHaveProperty("subscribe");
    expectTypeOf<ReactorClient>().not.toHaveProperty("rename");
    expectTypeOf<ReactorClient["drives"]["addFile"]>().toEqualTypeOf<
      IDriveClient["addFile"]
    >();
    expectTypeOf<ReactorClient["drives"]["listNodes"]>().toEqualTypeOf<
      IDriveClient["listNodes"]
    >();
    expectTypeOf<
      keyof ReactorReadClient["drives"]
    >().toEqualTypeOf<DriveReadMethods>();
    expectTypeOf<keyof ReactorClient["drives"]>().toEqualTypeOf<
      DriveReadMethods | DriveWriteMethods
    >();
  });

  it("offer the write half's own writes as `write`", () => {
    expectTypeOf<ReactorClient["write"]["execute"]>().toEqualTypeOf<
      IReactorWriteClient["execute"]
    >();
    expectTypeOf<ReactorClient["write"]["create"]>().toEqualTypeOf<
      IReactorWriteClient["create"]
    >();
    expectTypeOf<ReactorClient["write"]["drives"]["addFile"]>().toEqualTypeOf<
      IDriveWriteClient["addFile"]
    >();
    expectTypeOf<keyof ReactorClient["write"]>().toEqualTypeOf<
      WriteHalfMethods | "drives"
    >();
    expectTypeOf<ReactorClient["write"]>().not.toHaveProperty("rename");
    expectTypeOf<ReactorReadClient>().not.toHaveProperty("write");
  });

  it("name every method of the reactor's clients", () => {
    expectTypeOf<UnlistedMethods<IReactorClient>>().toEqualTypeOf<never>();
    expectTypeOf<UnlistedDriveMethods<IDriveClient>>().toEqualTypeOf<never>();
    expectTypeOf<
      UnlistedWriteHalfMethods<IReactorWriteClient>
    >().toEqualTypeOf<never>();
  });

  it("fail to compile when the write half gains an unlisted method", () => {
    type Grown = IReactorWriteClient & { frobnicate(): void };
    expectTypeOf<
      UnlistedWriteHalfMethods<Grown>
    >().toEqualTypeOf<"frobnicate">();
    // @ts-expect-error the new method is in no list
    type _Write = Listed<UnlistedWriteHalfMethods<Grown>>;
  });

  it("fail to compile when the drive client gains an unlisted method", () => {
    type Grown = IDriveClient & { frobnicate(): void };
    expectTypeOf<UnlistedDriveMethods<Grown>>().toEqualTypeOf<"frobnicate">();
    // @ts-expect-error the new method is in no list
    type _Drives = Listed<UnlistedDriveMethods<Grown>>;
  });

  it("fail to compile when a client gains an unlisted method", () => {
    type Grown = IReactorClient & { frobnicate(): void };
    expectTypeOf<UnlistedMethods<Grown>>().toEqualTypeOf<"frobnicate">();
    // @ts-expect-error the new method is in no list
    type _Client = Listed<UnlistedMethods<Grown>>;
  });
});

describe("ctx.reactor follows the declaration", () => {
  it("offers a read action no write method", () => {
    createAction({
      name: "peek",
      displayName: "Peek",
      description: "",
      auth: PieceAuth.None(),
      requireReactor: "read",
      props: {},
      run(ctx) {
        expectTypeOf<keyof typeof ctx.reactor>().toEqualTypeOf<
          ReadMethods | "drives" | "query"
        >();
        expectTypeOf<
          Extract<keyof typeof ctx.reactor, WriteMethods>
        >().toBeNever();
        return Promise.resolve(null);
      },
    });
  });

  it("gives an undeclared action no ctx.reactor", () => {
    createAction({
      name: "plain",
      displayName: "Plain",
      description: "",
      auth: PieceAuth.None(),
      props: {},
      run(ctx) {
        expectTypeOf(ctx).not.toHaveProperty("reactor");
        return Promise.resolve(null);
      },
    });
  });

  it("hands a property resolver an optional read client", async () => {
    const reactor = {} as ReactorReadClient;
    const seen: unknown[] = [];
    const dropdown = Property.Dropdown<string, false>({
      auth: undefined,
      displayName: "Document",
      required: false,
      refreshers: [],
      options: (_values, ctx) => {
        expectTypeOf(ctx.reactor).toEqualTypeOf<
          ReactorReadClient | undefined
        >();
        seen.push(ctx.reactor);
        return Promise.resolve({ options: [] });
      },
    });
    const multi = Property.MultiSelectDropdown<string, false>({
      auth: undefined,
      displayName: "Documents",
      required: false,
      refreshers: [],
      options: (_values, ctx) => {
        expectTypeOf(ctx.reactor).toEqualTypeOf<
          ReactorReadClient | undefined
        >();
        seen.push(ctx.reactor);
        return Promise.resolve({ options: [] });
      },
    });
    const dynamic = Property.DynamicProperties<false>({
      auth: undefined,
      displayName: "Fields",
      required: false,
      refreshers: [],
      props: (_values, ctx) => {
        expectTypeOf(ctx.reactor).toEqualTypeOf<
          ReactorReadClient | undefined
        >();
        seen.push(ctx.reactor);
        return Promise.resolve({});
      },
    });
    const ctx = { reactor } as PropertyContext;

    expect(dropdown.type).toBe("DROPDOWN");
    expect(multi.type).toBe("MULTI_SELECT_DROPDOWN");
    expect(dynamic.type).toBe("DYNAMIC");
    await dropdown.options({}, ctx);
    await multi.options({}, ctx);
    await dynamic.props({}, ctx);
    expect(seen).toEqual([reactor, reactor, reactor]);
  });
});

describe("error names", () => {
  it("are their own names", () => {
    expect({
      ReactorJobPendingError,
      ReactorJobFailedError,
      ReactorActionsFailedError,
      ReactorAccessDeniedError,
      ReactorRequestClosedError,
      DocumentModelUnavailableError,
    }).toEqual({
      ReactorJobPendingError: "ReactorJobPendingError",
      ReactorJobFailedError: "ReactorJobFailedError",
      ReactorActionsFailedError: "ReactorActionsFailedError",
      ReactorAccessDeniedError: "ReactorAccessDeniedError",
      ReactorRequestClosedError: "ReactorRequestClosedError",
      DocumentModelUnavailableError: "DocumentModelUnavailableError",
    });
  });
});

describe("deniedActionIndexes", () => {
  const denial = (message: string) =>
    Object.assign(new Error(message), { name: ReactorAccessDeniedError });

  it("reads the indexes a gate denial ends with", () => {
    expect(
      deniedActionIndexes(
        denial(
          "The run user may not apply A (x), C (y; z) to document d; denied action indexes: [0,2]",
        ),
      ),
    ).toEqual([0, 2]);
  });

  it("answers undefined for any other error", () => {
    expect(deniedActionIndexes(denial("declares read access only"))).toBe(
      undefined,
    );
    expect(
      deniedActionIndexes(new Error("denied action indexes: [1]")),
    ).toBeUndefined();
    expect(deniedActionIndexes("nope")).toBeUndefined();
  });
});

describe("assertActionsApplied", () => {
  const job = (...actions: object[]) => ({ result: { actions } }) as never;

  it("passes when every action applied", () => {
    expect(() =>
      assertActionsApplied(job({ actionId: "a", kind: "applied" }), [
        { id: "a", type: "SET_NAME" },
      ]),
    ).not.toThrow();
  });

  it("names each action that failed, was denied or produced nothing", () => {
    const failed = job(
      { actionId: "a", kind: "reducer-error", message: "bad" },
      { actionId: "b", kind: "denied", reason: "no grant" },
    );
    expect(() =>
      assertActionsApplied(failed, [
        { id: "a", type: "A" },
        { id: "b", type: "B" },
        { id: "c", type: "C" },
      ]),
    ).toThrow(
      expect.objectContaining({
        name: ReactorActionsFailedError,
        message:
          "Action A failed: bad; Action B was denied: no grant; Action C produced no operation",
      }),
    );
    expect(() => assertActionsApplied(failed)).toThrow(
      "Action a failed: bad; Action b was denied: no grant",
    );
  });
});
