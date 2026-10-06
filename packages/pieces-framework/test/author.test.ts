// A piece written the way an external developer would write one.
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  createAction,
  createPiece,
  createTrigger,
  PieceAuth,
  Property,
  PropertyType,
  TriggerStrategy,
} from "../src/index.js";
import type { ReactorReadClient, TestOrRunHookContext } from "../src/index.js";

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
  requireReactor: "read",
  props,
  async run(ctx) {
    const page = await ctx.reactor.find({ type: ctx.propsValue.documentType });
    return page.results.map((document) => document.header.id);
  },
});

const newDocument = createTrigger({
  name: "new_document",
  displayName: "New document",
  description: "Fires once for each document that appeared since the last poll",
  auth: PieceAuth.None(),
  type: TriggerStrategy.POLLING,
  requireReactor: "read",
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
    const page = await ctx.reactor.find({ type: ctx.propsValue.documentType });
    const ids = page.results.map((document) => document.header.id);
    await ctx.store.put("seen", ids);
    return ids.filter((id) => !seen.includes(id));
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

const documents = [
  { header: { id: "doc-1", documentType: "powerhouse/invoice" } },
  { header: { id: "doc-2", documentType: "powerhouse/invoice" } },
  { header: { id: "rcpt-1", documentType: "powerhouse/receipt" } },
] as PHDocument[];

// A reactor holding `documents`, answering `find` by type.
function fakeReactor(): ReactorReadClient {
  return {
    find: (search: { type?: string }) =>
      Promise.resolve({
        results: documents.filter(
          (document) => document.header.documentType === search.type,
        ),
        options: { cursor: "", limit: documents.length },
      }),
  } as unknown as ReactorReadClient;
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

  it("polls through ctx.store and ctx.reactor", async () => {
    const trigger = invoices.getTrigger("new_document");
    if (!trigger) throw new Error("new_document is not registered");
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
    type Ctx = TestOrRunHookContext<
      undefined,
      typeof props,
      TriggerStrategy.POLLING
    > & { reactor: ReactorReadClient };
    const ctx = {
      auth: undefined,
      propsValue: { documentType: "powerhouse/invoice" },
      store,
      reactor: fakeReactor(),
    } as unknown as Ctx;

    await trigger.onEnable(ctx);
    await expect(trigger.run(ctx)).resolves.toEqual(["doc-1", "doc-2"]);
    await expect(trigger.run(ctx)).resolves.toEqual([]);
    await trigger.onDisable(ctx);
    expect(memory.has("seen")).toBe(false);
  });
});
