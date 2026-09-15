// The host half of ctx.reactor: what it asks the reactor for, and what it
// does with what a piece sent it.
import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import { describe, expect, it } from "vitest";
import { SubgraphReactorPort } from "./reactor-port.js";

const DRIVE = "powerhouse/document-drive";
const REACTOR_DRIVE = "powerhouse/reactor-drive";

function doc(id: string, documentType: string, name = "") {
  return {
    header: { id, documentType, name, slug: id },
    state: { global: { name } },
    operations: { global: [{ index: 0, action: { type: "SET_NAME" } }] },
  };
}

// The same, with state a match can be run against.
function stateful(
  id: string,
  documentType: string,
  state: Record<string, unknown>,
) {
  return {
    header: { id, documentType, name: id, slug: id },
    state: { global: { name: id, ...state } },
    operations: { global: [{ index: 0, action: { type: "SET_NAME" } }] },
  };
}

// A reactor that records what was asked of it, answering from the documents
// it was seeded with.
function fakeReactor(documents: ReturnType<typeof doc>[] = []) {
  const calls: string[] = [];
  const client = {
    calls,
    find(filter: { type?: string; parentId?: string }) {
      calls.push(
        `find type=${filter.type ?? "-"} parent=${filter.parentId ?? "-"}`,
      );
      return Promise.resolve({
        results: documents.filter(
          (entry) => !filter.type || entry.header.documentType === filter.type,
        ),
      });
    },
    get(id: string) {
      calls.push(`get ${id}`);
      const found = documents.find((entry) => entry.header.id === id);
      if (!found) return Promise.reject(new Error(`no document ${id}`));
      return Promise.resolve(found);
    },
    createEmpty(documentType: string, options: { parentIdentifier?: string }) {
      calls.push(`createEmpty ${documentType} parent=${options.parentIdentifier ?? "-"}`);
      return Promise.resolve(doc("new-1", documentType));
    },
    execute(id: string, branch: string, actions: { type: string; input?: unknown }[]) {
      calls.push(
        `execute ${id} ${actions.map((a) => a.type).join(",")} name=${
          (actions[0]?.input as { name?: string } | undefined)?.name ?? "-"
        }`,
      );
      return Promise.resolve(doc(id, "acme/todo", "Named"));
    },
    getDocumentModelModules() {
      calls.push("models");
      return Promise.resolve({
        results: [
          { documentModel: { global: { id: "acme/todo", name: "Todo" } } },
        ],
      });
    },
    getDocumentModelModule(documentType: string) {
      calls.push(`model ${documentType}`);
      return Promise.resolve({
        utils: { createDocument: () => doc("empty-1", documentType) },
        documentModel: { global: { name: "Todo", specifications: [] } },
      });
    },
    drives: {
      getNode(driveId: string, nodeId: string) {
        calls.push(`node ${driveId}/${nodeId}`);
        // The folder lives in the reactor-drive, not the common drive type.
        if (driveId === "rdrive-1" && nodeId === "folder-1") {
          return Promise.resolve({ kind: "folder" });
        }
        return Promise.reject(new Error("not in this drive"));
      },
      addFile(driveId: string, document: { header: { name: string } }, parent?: string) {
        calls.push(
          `addFile ${driveId} parent=${parent ?? "-"} name=${document.header.name || "-"}`,
        );
        return Promise.resolve(doc("filed-1", "acme/todo", document.header.name));
      },
    },
  };
  const port = new SubgraphReactorPort({
    reactorClient: client,
  } as unknown as BaseSubgraph);
  return { port, calls };
}

describe("SubgraphReactorPort.find", () => {
  it("asks for a type and a parent together", async () => {
    const { port, calls } = fakeReactor([doc("d1", "acme/todo")]);

    await port.find({ documentType: "acme/todo", parentId: "drive-1" });

    // Both filters reach the index: a step that named a drive must not get
    // every document of that type on the reactor.
    expect(calls).toEqual(["find type=acme/todo parent=drive-1"]);
  });

  it("sweeps the installed types when neither is given", async () => {
    const { port, calls } = fakeReactor([doc("d1", "acme/todo")]);

    await port.find({});

    expect(calls).toEqual(["models", "find type=acme/todo parent=-"]);
  });
});

describe("SubgraphReactorPort.create", () => {
  it("names a document that belongs to no drive", async () => {
    const { port, calls } = fakeReactor();

    const created = await port.create({
      documentType: "acme/todo",
      name: "Invoice",
    });

    // createEmpty takes no name, so the port spends one operation on it
    // rather than leaving the caller to notice.
    expect(calls).toEqual([
      "createEmpty acme/todo parent=-",
      "execute new-1 SET_NAME name=Invoice",
    ]);
    expect(created.name).toBe("Named");
  });

  it("carries the name on the header when it files into a drive", async () => {
    const { port, calls } = fakeReactor([doc("drive-1", DRIVE)]);

    await port.create({
      documentType: "acme/todo",
      name: "Invoice",
      parentId: "drive-1",
    });

    // The node name comes from the header, so it is set before the file
    // lands — and no SET_NAME is dispatched afterwards.
    expect(calls).toContain("addFile drive-1 parent=- name=Invoice");
    expect(calls.some((call) => call.includes("SET_NAME"))).toBe(false);
  });

  it("finds a folder in every kind of drive, not just the common one", async () => {
    const { port, calls } = fakeReactor([
      doc("drive-1", DRIVE),
      doc("rdrive-1", REACTOR_DRIVE),
    ]);

    await port.create({
      documentType: "acme/todo",
      name: "Invoice",
      parentId: "folder-1",
    });

    // folder-1 is not a document, so the port sweeps drives for the node —
    // and a reactor-drive is a drive.
    expect(calls).toContain(`find type=${REACTOR_DRIVE} parent=-`);
    expect(calls).toContain("addFile rdrive-1 parent=folder-1 name=Invoice");
  });
});

// Binding a document to something outside the reactor — an order on a factory
// floor, an invoice in an archive — means finding it by a field in its state.
// The index cannot query state, so this is what makes that possible at all.
describe("SubgraphReactorPort.find with a state match", () => {
  const LEDGER = "umh/production-ledger";

  it("keeps only the documents holding the value at that path", async () => {
    const { port } = fakeReactor([
      stateful("ledger-1", LEDGER, { orderId: "order-a" }),
      stateful("ledger-2", LEDGER, { orderId: "order-b" }),
      stateful("ledger-3", LEDGER, {}),
    ]);

    const found = await port.find({
      documentType: LEDGER,
      match: { path: "orderId", value: "order-b" },
    });

    expect(found.map((entry) => entry.documentId)).toEqual(["ledger-2"]);
  });

  it("walks a dotted path into nested state", async () => {
    const { port } = fakeReactor([
      stateful("ledger-1", LEDGER, { settlement: { status: "OPEN" } }),
      stateful("ledger-2", LEDGER, { settlement: { status: "CLOSED" } }),
    ]);

    const found = await port.find({
      documentType: LEDGER,
      match: { path: "settlement.status", value: "OPEN" },
    });

    expect(found.map((entry) => entry.documentId)).toEqual(["ledger-1"]);
  });

  it("matches a number in state against the text an expression resolved to", async () => {
    // Every expression arrives as a string; `"42" !== 42` would make a match
    // against a numeric field silently impossible.
    const { port } = fakeReactor([stateful("ledger-1", LEDGER, { poNumber: 42 })]);

    const found = await port.find({
      documentType: LEDGER,
      match: { path: "poNumber", value: "42" },
    });

    expect(found).toHaveLength(1);
  });

  it("does not match a path that lands on an object or on nothing", async () => {
    const { port } = fakeReactor([
      stateful("ledger-1", LEDGER, { settlement: { status: "OPEN" } }),
      stateful("ledger-2", LEDGER, { orderId: null }),
    ]);

    const onObject = await port.find({
      documentType: LEDGER,
      match: { path: "settlement", value: "[object Object]" },
    });
    const onNull = await port.find({
      documentType: LEDGER,
      match: { path: "orderId", value: "" },
    });

    expect(onObject).toEqual([]);
    expect(onNull).toEqual([]);
  });

  it("withholds state unless it was asked for", async () => {
    // A find over a page of documents would otherwise carry every one of their
    // states across the worker boundary.
    const { port } = fakeReactor([
      stateful("ledger-1", LEDGER, { orderId: "order-a", secretish: "x" }),
    ]);

    const without = await port.find({ documentType: LEDGER });
    const with_ = await port.find({ documentType: LEDGER, withState: true });

    expect(without[0]).not.toHaveProperty("state");
    expect(with_[0].state).toMatchObject({ orderId: "order-a" });
  });
});
