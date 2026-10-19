import { describe, expect, it } from "vitest";
import {
  createReactorReadTools,
  summarizeState,
  type ReactorReadClient,
} from "../src/integrations/powerhouse/reactor-tools.js";

const DRIVE = "powerhouse/document-drive";

const drive = {
  header: { id: "d1", slug: "sektar", name: "Sektar", documentType: DRIVE },
  state: {
    global: { name: "Sektar Drive", nodes: [{ id: "n1" }, { id: "n2" }] },
  },
};
const invoice = {
  header: {
    id: "inv-1",
    slug: "inv-1",
    name: "INV-1",
    documentType: "sektar/invoice",
    lastModifiedAtUtcIso: "2026-10-19T00:00:00.000Z",
  },
  state: {
    global: {
      number: "INV-1",
      total: 1200,
      lines: [1, 2, 3],
      counterparty: { name: "Acme" },
      notes: null,
      description: "x".repeat(200),
    },
  },
};

function fakeClient() {
  const searches: Array<Record<string, unknown>> = [];
  const client: ReactorReadClient = {
    find: (search) => {
      searches.push(search);
      const results =
        search.type === DRIVE
          ? [drive]
          : search.type === "sektar/invoice"
            ? [invoice]
            : [drive, invoice];
      return Promise.resolve({ results });
    },
    get: (identifier) =>
      identifier === "inv-1"
        ? Promise.resolve(invoice)
        : Promise.reject(new Error(`not found: ${identifier}`)),
  };
  return { client, searches };
}

describe("reactor read tools", () => {
  it("summarizes a state as scalars, array counts and named references", () => {
    const summary = summarizeState(invoice.state.global);
    expect(summary).toEqual({
      number: "INV-1",
      total: 1200,
      linesCount: 3,
      counterparty: "Acme",
      description: `${"x".repeat(117)}…`,
    });
  });

  it("lists drives with their node count, lists documents by type within a drive, reads one", async () => {
    const { client, searches } = fakeClient();
    const tools = await createReactorReadTools(client, { maxStateChars: 60 });
    expect(Object.keys(tools)).toEqual([
      "listDrives",
      "listDocuments",
      "getDocument",
    ]);

    const drives = (await tools.listDrives.execute!({}, {} as never)) as {
      drives: Array<Record<string, unknown>>;
    };
    expect(drives.drives).toEqual([
      expect.objectContaining({ id: "d1", name: "Sektar Drive", nodeCount: 2 }),
    ]);

    const docs = (await tools.listDocuments.execute!(
      { driveId: "d1", documentType: "sektar/invoice" },
      {} as never,
    )) as { count: number; documents: Array<Record<string, unknown>> };
    expect(searches.at(-1)).toEqual({ type: "sektar/invoice", parentId: "d1" });
    expect(docs.count).toBe(1);
    expect(docs.documents[0]).toMatchObject({
      id: "inv-1",
      documentType: "sektar/invoice",
      summary: { number: "INV-1", linesCount: 3 },
    });

    // without a type filter the drives themselves are left out
    const all = (await tools.listDocuments.execute!({}, {} as never)) as {
      documents: Array<{ id: string }>;
    };
    expect(all.documents.map((d) => d.id)).toEqual(["inv-1"]);

    const doc = (await tools.getDocument.execute!(
      { identifier: "inv-1" },
      {} as never,
    )) as { id: string; state: string; truncated: boolean };
    expect(doc.id).toBe("inv-1");
    expect(doc.truncated).toBe(true);
    expect(doc.state.length).toBeLessThanOrEqual(61);
  });
});
