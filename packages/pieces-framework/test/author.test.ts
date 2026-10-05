// A piece written the way an external developer would write one.
import { describe, expect, it, vi } from "vitest";
import {
  createAction,
  createMockActionContext,
  createPiece,
  createTrigger,
  PieceAuth,
  Property,
  PropertyType,
  reactorOf,
  TriggerStrategy,
} from "../src/index.js";
import type {
  ReactorDocumentSummary,
  ReactorService,
  TestOrRunHookContext,
  WithReactor,
} from "../src/index.js";

const props = {
  documentType: Property.ShortText({
    displayName: "Document type",
    description: "e.g. powerhouse/invoice",
    required: true,
  }),
};

const listDocuments = createAction({
  name: "list_documents",
  displayName: "List documents",
  description: "Lists the documents of one type on this reactor",
  auth: PieceAuth.None(),
  props,
  async run(ctx) {
    return reactorOf(ctx).find({
      documentType: ctx.propsValue.documentType,
    });
  },
});

const newDocument = createTrigger({
  name: "new_document",
  displayName: "New document",
  description: "Fires once for each document that appeared since the last poll",
  auth: PieceAuth.None(),
  type: TriggerStrategy.POLLING,
  props,
  sampleData: {
    documentId: "doc-1",
    documentType: "powerhouse/invoice",
    name: "Invoice #1",
  },
  async onEnable(ctx) {
    await ctx.store.put<string[]>("seen", []);
  },
  async onDisable(ctx) {
    await ctx.store.delete("seen");
  },
  async run(ctx) {
    const seen = (await ctx.store.get<string[]>("seen")) ?? [];
    const documents = await reactorOf(ctx).find({
      documentType: ctx.propsValue.documentType,
    });
    await ctx.store.put(
      "seen",
      documents.map((d) => d.documentId),
    );
    return documents.filter((d) => !seen.includes(d.documentId));
  },
});

const invoices = createPiece({
  displayName: "Invoices",
  description: "Invoices on this reactor",
  logoUrl: "https://example.com/invoices.png",
  authors: ["acme"],
  auth: PieceAuth.None(),
  actions: [listDocuments],
  triggers: [newDocument],
});

const documents: ReactorDocumentSummary[] = [
  { documentId: "doc-1", documentType: "powerhouse/invoice", name: "One" },
  { documentId: "doc-2", documentType: "powerhouse/invoice", name: "Two" },
];

// The host's half of ctx.reactor; `find` stays a separate handle to assert on.
function fakeReactor() {
  const unused = () => Promise.reject(new Error("not under test"));
  const find = vi.fn<ReactorService["find"]>(() => Promise.resolve(documents));
  const reactor: ReactorService = {
    models: () => Promise.resolve([]),
    model: unused,
    get: unused,
    find,
    create: unused,
    execute: unused,
  };
  return { reactor, find };
}

describe("authoring a piece", () => {
  it("builds a Piece the loader recognises by class name", () => {
    expect(invoices.constructor.name).toBe("Piece");
    expect(invoices.getAction("list_documents")).toBe(listDocuments);
    expect(invoices.getTrigger("new_document")).toBe(newDocument);
  });

  it("describes itself through metadata()", () => {
    const metadata = invoices.metadata();
    expect(metadata.displayName).toBe("Invoices");
    expect(metadata.logoUrl).toBe("https://example.com/invoices.png");
    expect(metadata.authors).toEqual(["acme"]);
    expect(metadata.auth).toBeUndefined();
    expect(Object.keys(metadata.actions)).toEqual(["list_documents"]);
    expect(metadata.actions.list_documents.props.documentType.type).toBe(
      PropertyType.SHORT_TEXT,
    );
    expect(Object.keys(metadata.triggers)).toEqual(["new_document"]);
    expect(metadata.triggers.new_document.type).toBe(TriggerStrategy.POLLING);
    expect(metadata.triggers.new_document.sampleData).toMatchObject({
      documentId: "doc-1",
    });
  });

  it("runs the action against ctx.reactor", async () => {
    const { reactor, find } = fakeReactor();
    const ctx = {
      ...createMockActionContext<typeof props>({
        propsValue: { documentType: "powerhouse/invoice" },
      }),
      reactor,
    };
    await expect(listDocuments.run(ctx)).resolves.toEqual(documents);
    expect(find).toHaveBeenCalledWith({ documentType: "powerhouse/invoice" });
  });

  it("polls through ctx.store and ctx.reactor", async () => {
    const trigger = invoices.getTrigger("new_document");
    if (!trigger) throw new Error("new_document is not registered");
    const { reactor } = fakeReactor();
    const memory = new Map<string, unknown>();
    const store = {
      put: <T>(key: string, value: T) => {
        memory.set(key, value);
        return Promise.resolve(value);
      },
      get: <T>(key: string) => Promise.resolve((memory.get(key) as T) ?? null),
      delete: (key: string) => {
        memory.delete(key);
        return Promise.resolve();
      },
    };
    type Ctx = WithReactor<
      TestOrRunHookContext<undefined, typeof props, TriggerStrategy.POLLING>
    >;
    const ctx = {
      auth: undefined,
      propsValue: { documentType: "powerhouse/invoice" },
      store,
      reactor,
    } as unknown as Ctx;

    await trigger.onEnable(ctx);
    await expect(trigger.run(ctx)).resolves.toEqual(documents);
    await expect(trigger.run(ctx)).resolves.toEqual([]);
    await trigger.onDisable(ctx);
    expect(memory.has("seen")).toBe(false);
  });
});
