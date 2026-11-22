import { describe, it, expect, vi, afterAll } from "vitest";
import { z } from "zod";
import { bridgeSubscriptions } from "../src/integrations/powerhouse/subscriptions.js";
import { ensureDrive } from "../src/integrations/powerhouse/drive.js";
import { defineRegistry } from "../src/integrations/powerhouse/registry.js";
import { defineCli, defineCommand } from "../src/index.js";
import type {
  InProcessReactorClientModule,
  IReactorClient,
} from "@powerhousedao/reactor";
import type { ReactorContext } from "../src/integrations/powerhouse/types.js";
import { buildTestReactor } from "./fixtures/in-process-reactor.js";

describe("bridgeSubscriptions", () => {
  it("maps Created events to powerhouse:document:created", () => {
    const emitted: Array<{ event: string; data: unknown }> = [];
    const emit = (event: string, data?: unknown) =>
      emitted.push({ event, data });

    const mockClient = {
      subscribe: (search: any, callback: any) => {
        // Simulate a Created event
        callback({
          type: "created",
          documents: [
            { header: { id: "doc-1", documentType: "conversation" } },
            { header: { id: "doc-2", documentType: "task" } },
          ],
        });
        return () => {};
      },
    };

    bridgeSubscriptions(
      mockClient as any,
      { documentTypes: ["conversation"] },
      emit,
    );
    expect(emitted).toHaveLength(2);
    expect(emitted[0]).toEqual({
      event: "powerhouse:document:created",
      data: { documentId: "doc-1", documentType: "conversation" },
    });
    expect(emitted[1]).toEqual({
      event: "powerhouse:document:created",
      data: { documentId: "doc-2", documentType: "task" },
    });
  });

  it("maps Updated events to powerhouse:document:changed", () => {
    const emitted: Array<{ event: string; data: unknown }> = [];
    const emit = (event: string, data?: unknown) =>
      emitted.push({ event, data });
    const docs = [{ header: { id: "doc-1", documentType: "conversation" } }];

    const mockClient = {
      subscribe: (_search: any, callback: any) => {
        callback({ type: "updated", documents: docs });
        return () => {};
      },
    };

    bridgeSubscriptions(mockClient as any, {}, emit);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({
      event: "powerhouse:document:changed",
      data: { changeType: "updated", documents: docs },
    });
  });

  it("maps Deleted events to powerhouse:document:deleted", () => {
    const emitted: Array<{ event: string; data: unknown }> = [];
    const emit = (event: string, data?: unknown) =>
      emitted.push({ event, data });

    const mockClient = {
      subscribe: (_search: any, callback: any) => {
        callback({ type: "deleted", documents: [{ header: { id: "doc-1" } }] });
        return () => {};
      },
    };

    bridgeSubscriptions(mockClient as any, {}, emit);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({
      event: "powerhouse:document:deleted",
      data: { documentId: "doc-1" },
    });
  });

  it("returns unsubscribe function", () => {
    const unsub = vi.fn();
    const mockClient = {
      subscribe: () => unsub,
    };

    const result = bridgeSubscriptions(mockClient as any, {}, () => {});
    result();
    expect(unsub).toHaveBeenCalled();
  });

  it("passes documentTypes filter to client.subscribe", () => {
    let receivedSearch: any;
    const mockClient = {
      subscribe: (search: any, _callback: any) => {
        receivedSearch = search;
        return () => {};
      },
    };

    bridgeSubscriptions(
      mockClient as any,
      { documentTypes: ["conversation", "task"] },
      () => {},
    );
    expect(receivedSearch).toEqual({ documentTypes: ["conversation", "task"] });
  });

  it("handles errors in the callback without crashing", () => {
    const emit = () => {
      throw new Error("boom");
    };
    const mockClient = {
      subscribe: (_search: any, callback: any) => {
        // Should not throw even though emit throws
        expect(() => {
          callback({
            type: "created",
            documents: [{ header: { id: "x", documentType: "t" } }],
          });
        }).not.toThrow();
        return () => {};
      },
    };

    bridgeSubscriptions(mockClient as any, {}, emit);
  });

  it("handles missing documents array gracefully", () => {
    const emitted: Array<{ event: string; data: unknown }> = [];
    const emit = (event: string, data?: unknown) =>
      emitted.push({ event, data });

    const mockClient = {
      subscribe: (_search: any, callback: any) => {
        // Created event with undefined documents
        callback({ type: "created" });
        return () => {};
      },
    };

    // Should not throw
    bridgeSubscriptions(mockClient as any, {}, emit);
    expect(emitted).toHaveLength(0);
  });
});

describe("ensureDrive", () => {
  type FoundDrive = {
    header: { id: string; name?: string };
    name?: string;
    state?: { global?: { name?: string } };
  };
  type FoundPage = { results: FoundDrive[]; next?: () => Promise<FoundPage> };
  type BuiltDrive = {
    header: { id: string; name?: string; meta?: Record<string, unknown> };
    state?: { global?: { name?: string } };
  };
  type NewDriveOptions = {
    id?: string;
    signaturePolicy?: string;
    initialState?: { global?: { name?: string } };
  };

  /**
   * A stand-in client with only the methods ensureDrive uses. Its write half
   * has `create` alone, and `writes` records every write submitted.
   */
  function mockClient(overrides: {
    find?: (search: { type?: string }) => Promise<FoundPage>;
    newDocument?: (
      type: string,
      options?: NewDriveOptions,
    ) => Promise<BuiltDrive>;
    create?: (doc: BuiltDrive) => Promise<{ header: { id: string } }>;
  }): IReactorClient & { writes: string[] } {
    const create =
      overrides.create ?? (async () => ({ header: { id: "fallback" } }));
    const writes: string[] = [];
    return {
      writes,
      find: overrides.find ?? (async () => ({ results: [] })),
      newDocument:
        overrides.newDocument ??
        (async (_type: string, options?: NewDriveOptions) => ({
          header: { id: options?.id ?? "", name: "" },
          state: { global: { name: "", ...options?.initialState?.global } },
        })),
      write: {
        create: async (doc: BuiltDrive) => {
          writes.push("create");
          return { document: () => create(doc) };
        },
      },
    } as unknown as IReactorClient & { writes: string[] };
  }

  it("returns existing drive when name matches", async () => {
    const client = mockClient({
      find: async () => ({
        results: [{ header: { id: "existing-drive-id" }, name: "My Drive" }],
      }),
    });

    const result = await ensureDrive(client, { name: "My Drive" });
    expect(result).toEqual({ id: "existing-drive-id", name: "My Drive" });
    expect(client.writes).toEqual([]);
  });

  it("matches a drive by its header name", async () => {
    const client = mockClient({
      find: async () => ({
        results: [{ header: { id: "drive-h", name: "Header Named" } }],
      }),
    });

    const result = await ensureDrive(client, { name: "Header Named" });
    expect(result).toEqual({ id: "drive-h", name: "Header Named" });
    expect(client.writes).toEqual([]);
  });

  it("looks drives up by type through client.find", async () => {
    const searches: Array<{ type?: string }> = [];
    const client = mockClient({
      find: async (search) => {
        searches.push(search);
        return { results: [] };
      },
      create: async () => ({ header: { id: "new-id" } }),
    });

    await ensureDrive(client, { name: "My Drive" });
    expect(searches).toEqual([{ type: "powerhouse/document-drive" }]);
  });

  it("reads every result page", async () => {
    const client = mockClient({
      find: async () => ({
        results: [{ header: { id: "drive-1" }, name: "One" }],
        next: async () => ({
          results: [{ header: { id: "drive-2" }, name: "Two" }],
        }),
      }),
    });

    const result = await ensureDrive(client, { name: "Two" });
    expect(result).toEqual({ id: "drive-2", name: "Two" });
  });

  it("falls back to first drive when default name and single drive exists", async () => {
    const client = mockClient({
      find: async () => ({
        results: [
          { header: { id: "existing-drive-id" }, name: "something-else" },
        ],
      }),
    });

    const result = await ensureDrive(client);
    expect(result).toEqual({ id: "existing-drive-id", name: "default" });
  });

  it("creates a new drive when none exist", async () => {
    const client = mockClient({
      create: async () => ({ header: { id: "new-drive-id" } }),
    });

    const result = await ensureDrive(client, { name: "Test Drive" });
    expect(result).toEqual({ id: "new-drive-id", name: "Test Drive" });
  });

  it("names the new drive on its header and in its global state, in one write", async () => {
    let created: BuiltDrive | undefined;
    const client = mockClient({
      create: async (doc) => {
        created = doc;
        return { header: { id: "new-id" } };
      },
    });

    await ensureDrive(client, { name: "My Agent" });
    expect(created?.header.name).toBe("My Agent");
    expect(created?.state?.global?.name).toBe("My Agent");
    expect(client.writes).toEqual(["create"]);
  });

  it("uses default name when no config provided", async () => {
    let created: BuiltDrive | undefined;
    const client = mockClient({
      create: async (doc) => {
        created = doc;
        return { header: { id: "new-id" } };
      },
    });

    await ensureDrive(client);
    expect(created?.header.name).toBe("default");
    expect(created?.state?.global?.name).toBe("default");
  });

  it("handles empty results from find", async () => {
    const client = mockClient({
      create: async () => ({ header: { id: "new-drive-id" } }),
    });

    const result = await ensureDrive(client);
    expect(result).toEqual({ id: "new-drive-id", name: "default" });
  });

  it("creates new drive when name does not match any existing (non-default)", async () => {
    const client = mockClient({
      find: async () => ({
        results: [{ header: { id: "drive-a" }, name: "Other Drive" }],
      }),
      create: async () => ({ header: { id: "new-id" } }),
    });

    const result = await ensureDrive(client, { name: "My Drive" });
    expect(result).toEqual({ id: "new-id", name: "My Drive" });
  });

  it("matches drive by state.global.name", async () => {
    const client = mockClient({
      find: async () => ({
        results: [
          { header: { id: "drive-x" }, state: { global: { name: "Clint" } } },
        ],
      }),
    });

    const result = await ensureDrive(client, { name: "Clint" });
    expect(result).toEqual({ id: "drive-x", name: "Clint" });
  });

  it("returns existing drive when deterministic id matches", async () => {
    const client = mockClient({
      find: async () => ({
        results: [
          { header: { id: "drive-deterministic" } },
          { header: { id: "drive-other" } },
        ],
      }),
    });

    const result = await ensureDrive(client, {
      id: "drive-deterministic",
      name: "Named",
    });
    expect(result).toEqual({ id: "drive-deterministic", name: "Named" });
  });

  it("creates a deterministic id as a legacy drive and merges preferredEditor into its meta", async () => {
    let requested: NewDriveOptions | undefined;
    let created: BuiltDrive | undefined;
    const client = mockClient({
      newDocument: async (_type, options) => {
        requested = options;
        return { header: { id: options?.id ?? "", meta: { kept: true } } };
      },
      create: async (doc) => {
        created = doc;
        return { header: { id: doc.header.id } };
      },
    });

    const result = await ensureDrive(client, {
      id: "fixed-id",
      name: "Fixed",
      preferredEditor: "test-editor",
    });
    expect(result).toEqual({ id: "fixed-id", name: "Fixed" });
    expect(requested).toEqual({
      initialState: { global: { name: "Fixed" } },
      signaturePolicy: "legacy",
      id: "fixed-id",
    });
    expect(created?.header.meta).toEqual({
      kept: true,
      preferredEditor: "test-editor",
    });
    expect(created?.header.name).toBe("Fixed");
    expect(client.writes).toEqual(["create"]);
  });

  it("takes a resolved id before looking anything up", async () => {
    const client = mockClient({
      find: async () => {
        throw new Error("find must not run");
      },
    });
    const seenClients: unknown[] = [];

    const result = await ensureDrive(client, {
      name: "Pointed",
      resolveId: async (c) => {
        seenClients.push(c);
        return "pointed-id";
      },
      canCreate: () => false,
    });
    expect(result).toEqual({ id: "pointed-id", name: "Pointed" });
    expect(seenClients).toEqual([client]);
  });

  it("falls through when resolveId resolves nothing", async () => {
    const client = mockClient({
      find: async () => ({
        results: [{ header: { id: "by-name" }, name: "Home" }],
      }),
    });

    const result = await ensureDrive(client, {
      name: "Home",
      resolveId: async () => undefined,
    });
    expect(result).toEqual({ id: "by-name", name: "Home" });
  });

  it("does not match by name with matchByName: false", async () => {
    let looked = false;
    const client = mockClient({
      find: async () => {
        looked = true;
        return { results: [{ header: { id: "same-name" }, name: "default" }] };
      },
      create: async () => ({ header: { id: "new-id" } }),
    });

    const result = await ensureDrive(client, {
      name: "default",
      matchByName: false,
    });
    expect(result).toEqual({ id: "new-id", name: "default" });
    expect(looked).toBe(false);
  });

  it("defers a drive it may not create yet", async () => {
    const client = mockClient({});

    const result = await ensureDrive(client, {
      name: "Later",
      matchByName: false,
      canCreate: () => false,
    });
    expect(result).toEqual({ id: "", name: "Later", deferred: true });
    expect(client.writes).toEqual([]);
  });

  it("calls onCreated with the new id once the drive is created", async () => {
    const order: string[] = [];
    const client = mockClient({
      create: async () => {
        order.push("created");
        return { header: { id: "new-id" } };
      },
    });

    await ensureDrive(client, {
      name: "Home",
      onCreated: (id) => {
        order.push(`onCreated:${id}`);
      },
    });
    expect(order).toEqual(["created", "onCreated:new-id"]);
  });

  it("does not call onCreated for a drive that already exists", async () => {
    const created: string[] = [];
    const client = mockClient({
      find: async () => ({
        results: [{ header: { id: "existing" }, name: "Home" }],
      }),
    });

    await ensureDrive(client, {
      name: "Home",
      onCreated: (id) => {
        created.push(id);
      },
    });
    expect(created).toEqual([]);
  });
});

describe("ReactorContext type", () => {
  it("has the expected shape", () => {
    const ctx: ReactorContext = {
      client: {} as any,
      driveId: "test-drive",
      async shutdown() {},
    };
    expect(ctx.driveId).toBe("test-drive");
    expect(ctx.switchboardUrl).toBeUndefined();
    expect(ctx.driveUrl).toBeUndefined();
    expect(ctx.drives).toBeUndefined();
    expect(ctx.personalDriveId).toBeUndefined();
  });

  it("accepts all optional switchboard fields", () => {
    const ctx: ReactorContext = {
      client: {} as any,
      driveId: "test",
      personalDriveId: "test",
      drives: [{ id: "test", name: "Test", role: "personal" }],
      switchboardUrl: "http://localhost:4001/graphql",
      driveUrl: "http://localhost:4001/d/test",
      async shutdown() {},
    };
    expect(ctx.switchboardUrl).toBe("http://localhost:4001/graphql");
    expect(ctx.driveUrl).toBe("http://localhost:4001/d/test");
    expect(ctx.drives).toHaveLength(1);
    expect(ctx.personalDriveId).toBe("test");
  });
});

// ── Real integration tests (an in-process reactor) ───────────────

describe("Powerhouse real integration", () => {
  let reactorModule: InProcessReactorClientModule;
  let driveId: string;

  afterAll(async () => {
    if (reactorModule) {
      try {
        const status = reactorModule.reactor.kill();
        await status.completed;
      } catch {}
    }
  });

  // Cold reactor + PGlite WASM load: ~3.4s on an idle CI runner, past 5s under load.
  it("ensureDrive creates a drive on first call", async () => {
    reactorModule = await buildTestReactor();
    const result = await ensureDrive(reactorModule.client, {
      name: "test-drive",
    });
    driveId = result.id;
    expect(typeof driveId).toBe("string");
    expect(driveId.length).toBeGreaterThan(0);
    expect(result.name).toBe("test-drive");
  }, 30_000);

  it("ensureDrive returns the same drive on second call", async () => {
    const result = await ensureDrive(reactorModule.client, {
      name: "test-drive",
    });
    expect(result.id).toBe(driveId);
  });
});

describe("defineCli + configureReactor", () => {
  it("CLI with reactor reports hasReactor in metadata", async () => {
    const noopCmd = defineCommand({
      id: "noop",
      description: "No-op",
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
    });

    const cli = defineCli({
      name: "ph-test-reactor",
      version: "0.0.1",
      description: "Test CLI with reactor",
      commands: [noopCmd],
    });

    const reactor: ReactorContext = {
      client: {} as ReactorContext["client"],
      driveId: "test-cli-drive",
      async shutdown() {},
    };
    cli.configureReactor({ create: () => Promise.resolve(reactor) });

    expect(cli.hasReactor).toBe(true);

    // argv must include node + script prefix — runImpl does argv.slice(2)
    let metaOutput = "";
    await cli.run(["node", "test", "--meta"], {
      stdout: (text: string) => {
        metaOutput += text;
      },
      stderr: () => {},
      exit: () => {},
    });

    const parsed = JSON.parse(metaOutput);
    expect(parsed.name).toBe("ph-test-reactor");
    expect(parsed.hasReactor).toBe(true);
  });
});

describe("defineRegistry", () => {
  it("builds a registry keyed by documentModel.global.id", () => {
    const moduleA = {
      documentModel: { global: { id: "test/a" } },
      actions: {},
    } as unknown as Parameters<typeof defineRegistry>[0][number];
    const moduleB = {
      documentModel: { global: { id: "test/b" } },
      actions: {},
    } as unknown as Parameters<typeof defineRegistry>[0][number];

    const registry = defineRegistry([moduleA, moduleB] as const);

    expect(Object.keys(registry)).toEqual(["test/a", "test/b"]);
    expect((registry as Record<string, unknown>)["test/a"]).toBe(moduleA);
    expect((registry as Record<string, unknown>)["test/b"]).toBe(moduleB);
  });

  it("returns an empty registry for an empty tuple", () => {
    const registry = defineRegistry([] as const);
    expect(Object.keys(registry)).toEqual([]);
  });
});
