import {
  addFile,
  addFolder,
  driveCreateDocument,
  driveDocumentReducer,
  type DocumentDriveAction,
  type DocumentDriveDocument,
  type FileNode,
} from "@powerhousedao/shared/document-drive";
import { describe, expect, it } from "vitest";
import {
  deletionTarget,
  homeFolderName,
  keyBetween,
  nextKey,
  orderWorkflows,
  reorderActions,
  spreadKeys,
} from "./workflow-order.js";

const WORKFLOW = "powerhouse/workflow";

function apply(
  drive: DocumentDriveDocument,
  actions: DocumentDriveAction[],
): DocumentDriveDocument {
  return actions.reduce(
    (doc, action) => driveDocumentReducer(doc, action) as DocumentDriveDocument,
    drive,
  );
}

function addWorkflow(
  drive: DocumentDriveDocument,
  id: string,
  key?: string,
): DocumentDriveDocument {
  if (!key)
    return apply(drive, [
      addFile({ id, name: id, documentType: WORKFLOW, parentFolder: null }),
    ]);
  return apply(drive, [
    addFolder({ id: `home-${id}`, name: homeFolderName(key, id) }),
    addFile({
      id,
      name: id,
      documentType: WORKFLOW,
      parentFolder: `home-${id}`,
    }),
  ]);
}

function order(drive: DocumentDriveDocument) {
  const nodes = drive.state.global.nodes;
  const files = nodes.filter((n): n is FileNode => n.kind === "file");
  return orderWorkflows(files, nodes);
}

const ids = (drive: DocumentDriveDocument) =>
  order(drive).map((item) => item.node.id);

function move(drive: DocumentDriveDocument, id: string, to: number) {
  const ordered = order(drive);
  const from = ordered.findIndex((item) => item.node.id === id);
  return apply(drive, reorderActions(ordered, from, to));
}

describe("keyBetween", () => {
  it("lands strictly between its bounds", () => {
    const pairs: [string | null, string | null][] = [
      [null, null],
      [null, "1"],
      ["a", null],
      ["a", "b"],
      ["a", "a1"],
      ["az", "b"],
      ["V", "W"],
    ];
    for (const [a, b] of pairs) {
      const key = keyBetween(a, b);
      if (a) expect(key > a).toBe(true);
      if (b) expect(key < b).toBe(true);
      expect(key.endsWith("0")).toBe(false);
    }
  });

  it("keeps finding room when inserting at the same spot", () => {
    let low: string | null = null;
    const high = "V";
    for (let i = 0; i < 50; i++) {
      const key = keyBetween(low, high);
      if (low) expect(key > low).toBe(true);
      expect(key < high).toBe(true);
      low = key;
    }
  });

  it("spreads ascending keys", () => {
    for (const count of [1, 3, 61, 62, 200]) {
      const keys = spreadKeys(count);
      expect(new Set(keys).size).toBe(count);
      expect([...keys].sort()).toEqual(keys);
    }
  });
});

describe("workflow order", () => {
  const base = () => driveCreateDocument();

  it("sorts by home-folder key, regardless of node ids", () => {
    let drive = base();
    drive = addWorkflow(drive, "w-a", "c");
    drive = addWorkflow(drive, "w-b", "a");
    drive = addWorkflow(drive, "w-c", "b");
    expect(ids(drive)).toEqual(["w-b", "w-c", "w-a"]);
  });

  it("puts workflows without a home folder first, then appends new ones", () => {
    let drive = base();
    drive = addWorkflow(drive, "w-z");
    drive = addWorkflow(drive, "w-a", "V");
    drive = addWorkflow(drive, "w-b", nextKey(order(drive)));
    expect(ids(drive)).toEqual(["w-z", "w-a", "w-b"]);
  });

  it("ignores folders that are not a lone workflow's home", () => {
    let drive = apply(base(), [
      addFolder({ id: "shared", name: "a · Shared" }),
      addFile({
        id: "w-1",
        name: "1",
        documentType: WORKFLOW,
        parentFolder: "shared",
      }),
      addFile({
        id: "w-2",
        name: "2",
        documentType: WORKFLOW,
        parentFolder: "shared",
      }),
    ]);
    drive = addWorkflow(drive, "w-0", "a");
    expect(order(drive).map((item) => item.key)).toEqual([
      undefined,
      undefined,
      "a",
    ]);
  });

  it("reorders with a single folder rename and keeps the order", () => {
    let drive = base();
    for (const [id, key] of [
      ["w-1", "a"],
      ["w-2", "b"],
      ["w-3", "c"],
    ])
      drive = addWorkflow(drive, id, key);
    const ordered = order(drive);
    const actions = reorderActions(ordered, 2, 0);
    expect(actions.map((a) => a.type)).toEqual(["UPDATE_NODE"]);
    drive = apply(drive, actions);
    expect(ids(drive)).toEqual(["w-3", "w-1", "w-2"]);

    drive = move(drive, "w-3", 2);
    expect(ids(drive)).toEqual(["w-1", "w-2", "w-3"]);
    drive = move(drive, "w-1", 1);
    expect(ids(drive)).toEqual(["w-2", "w-1", "w-3"]);
  });

  it("gives every workflow a home folder when moving among unkeyed ones", () => {
    let drive = base();
    for (const id of ["w-1", "w-2", "w-3"]) drive = addWorkflow(drive, id);
    drive = move(drive, "w-3", 0);
    expect(ids(drive)).toEqual(["w-3", "w-1", "w-2"]);
    expect(order(drive).every((item) => item.folder)).toBe(true);
    // Names stay readable; only the key prefix is machine-made.
    expect(order(drive)[0].folder!.name).toMatch(/^[0-9A-Za-z]+ · w-3$/);
  });

  it("names new home folders after the workflow document", () => {
    let drive = base();
    for (const id of ["w-1", "w-2"]) drive = addWorkflow(drive, id);
    const names = new Map([["w-2", "Daily digest"]]);
    drive = apply(drive, reorderActions(order(drive), 1, 0, names));
    expect(
      order(drive).map((item) => item.folder!.name.split(" · ")[1]),
    ).toEqual(["Daily digest", "w-1"]);
  });

  it("re-spreads keys when neighbours share one", () => {
    let drive = base();
    drive = addWorkflow(drive, "w-1", "a");
    drive = addWorkflow(drive, "w-2", "b");
    drive = addWorkflow(drive, "w-3", "b");
    drive = move(drive, "w-1", 1);
    expect(ids(drive)).toEqual(["w-2", "w-1", "w-3"]);
    const keys = order(drive).map((item) => item.key!);
    expect(new Set(keys).size).toBe(3);
  });

  it("deletes a workflow through its home folder", () => {
    let drive = base();
    drive = addWorkflow(drive, "w-1", "a");
    drive = addWorkflow(drive, "w-2");
    const nodes = drive.state.global.nodes;
    expect(deletionTarget("w-1", nodes)?.id).toBe("home-w-1");
    expect(deletionTarget("w-2", nodes)?.id).toBe("w-2");
  });
});
