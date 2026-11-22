import type { Node } from "@powerhousedao/shared/document-drive";
import { describe, expect, it } from "vitest";
import {
  EXPLORER_DOCUMENT_TYPES,
  findStagePage,
  STAGES,
  stageForDocumentType,
  treePageFor,
} from "./layout.js";
import {
  buildTree,
  creatableTypes,
  findPackageNode,
  hasSpecifications,
  stageDocuments,
  type TreeRow,
} from "./tree.js";

const file = (id: string, name: string, documentType: string): Node =>
  ({ kind: "file", id, name, documentType, parentFolder: null }) as Node;
const folder = (id: string, name: string): Node =>
  ({ kind: "folder", id, name, parentFolder: null }) as Node;

/** One line per row, as the tree reads top to bottom. */
function outline(rows: TreeRow[]): string[] {
  return rows.map((row) => {
    switch (row.kind) {
      case "package":
        return `# ${row.name}`;
      case "stage":
        return `${row.label}${row.creatable.length ? " +" : ""}`;
      case "document":
        return `  ${row.name}`;
      case "page":
        return `  [${row.label}]`;
    }
  });
}

const ALL_TYPES = EXPLORER_DOCUMENT_TYPES;

const pizza: Node[] = [
  file("p", "pizza-plaza", "powerhouse/package"),
  file("w", "Work breakdown", "powerhouse/work-breakdown-structure"),
  file("f", "Order tracking", "powerhouse/feature"),
  file("b", "Brand", "powerhouse/brand-sheet"),
  file("a", "Audience", "powerhouse/audience-sheet"),
  file("pr", "Problem", "powerhouse/problem-sheet"),
  file("pc", "Order index", "powerhouse/processor"),
  file("sg", "Orders API", "powerhouse/subgraph"),
  file("ap", "Kitchen queue", "powerhouse/app"),
  file("ed", "Order editor", "powerhouse/document-editor"),
  file("dm", "Order", "powerhouse/document-model"),
  file("chat", "Session 1", "powerhouse/chat-session"),
  folder("fo", "attachments"),
];

describe("stage layout", () => {
  it("has the four stages in order, with five types each for Ideate and Specify", () => {
    expect(STAGES.map((s) => s.id)).toEqual([
      "ideate",
      "specify",
      "build",
      "deploy",
    ]);
    expect(STAGES[0].documentTypes).toHaveLength(5);
    expect(STAGES[1].documentTypes).toHaveLength(5);
    expect(STAGES[2].documentTypes).toHaveLength(0);
    expect(STAGES[3].documentTypes).toHaveLength(0);
  });

  it("files every type under one stage", () => {
    const types = STAGES.flatMap((s) =>
      s.documentTypes.map((t) => t.documentType),
    );
    expect(new Set(types).size).toBe(types.length);
    expect(stageForDocumentType("powerhouse/feature")?.id).toBe("ideate");
    expect(stageForDocumentType("powerhouse/subgraph")?.id).toBe("specify");
    expect(stageForDocumentType("powerhouse/package")).toBeUndefined();
    expect(stageForDocumentType("powerhouse/chat-session")).toBeUndefined();
  });

  it("reaches one environment from Environments, not from the tree", () => {
    expect(findStagePage("environment")?.stage.id).toBe("deploy");
    expect(treePageFor("environment")).toBe("environments");
    expect(treePageFor("versions")).toBe("versions");
  });
});

describe("explorer tree", () => {
  it("lays a package drive out as package, Ideate, Specify, Build, Deploy", () => {
    expect(outline(buildTree(pizza, { installedTypes: ALL_TYPES }))).toEqual([
      "# pizza-plaza",
      "Ideate +",
      "  Problem",
      "  Audience",
      "  Brand",
      "  Order tracking",
      "  Work breakdown",
      "Specify +",
      "  Order",
      "  Order editor",
      "  Kitchen queue",
      "  Orders API",
      "  Order index",
      "Build",
      "  [Versions]",
      "  [Packages]",
      "  [Images]",
      "  [Installers]",
      "Deploy",
      "  [Environments]",
    ]);
  });

  it("shows a new project as empty Ideate and Specify over the fixed pages", () => {
    const rows = buildTree([], {
      packageName: "pizza-plaza",
      installedTypes: ALL_TYPES,
    });
    expect(outline(rows)).toEqual([
      "# pizza-plaza",
      "Ideate +",
      "Specify +",
      "Build",
      "  [Versions]",
      "  [Packages]",
      "  [Images]",
      "  [Installers]",
      "Deploy",
      "  [Environments]",
    ]);
    expect(rows[0]).toMatchObject({ kind: "package", nodeId: undefined });
    expect(hasSpecifications([])).toBe(false);
  });

  it("names the package row after its document, then the host's name", () => {
    expect(buildTree(pizza, { packageName: "other" })[0]).toMatchObject({
      nodeId: "p",
      name: "pizza-plaza",
    });
    expect(buildTree([], { packageName: "other" })[0]).toMatchObject({
      name: "other",
    });
    expect(buildTree([])[0]).toMatchObject({ name: "Package" });
    expect(findPackageNode(pizza)?.id).toBe("p");
  });

  it("orders a stage's documents by type, then by name", () => {
    const nodes = [
      file("2", "Zebra", "powerhouse/document-model"),
      file("3", "Alpha editor", "powerhouse/document-editor"),
      file("1", "Apple", "powerhouse/document-model"),
    ];
    expect(
      stageDocuments(nodes, STAGES[1].documentTypes).map((n) => n.name),
    ).toEqual(["Apple", "Zebra", "Alpha editor"]);
  });

  it("names an unnamed document after its type", () => {
    const rows = buildTree([file("x", " ", "powerhouse/problem-sheet")]);
    expect(rows.find((r) => r.kind === "document")).toMatchObject({
      name: "Problem",
    });
  });

  it("hides a collapsed stage's rows", () => {
    const rows = buildTree(pizza, { collapsed: new Set(["ideate", "build"]) });
    expect(outline(rows)).toEqual([
      "# pizza-plaza",
      "Ideate",
      "Specify",
      "  Order",
      "  Order editor",
      "  Kitchen queue",
      "  Orders API",
      "  Order index",
      "Build",
      "Deploy",
      "  [Environments]",
    ]);
  });

  it("offers on + only the stage's types that are installed", () => {
    const rows = buildTree([], {
      installedTypes: [
        "powerhouse/document-model",
        "powerhouse/app",
        "powerhouse/chat-session",
      ],
    });
    const stage = (id: string) =>
      rows.find((r) => r.kind === "stage" && r.stage === id);
    expect(stage("ideate")).toMatchObject({ creatable: [] });
    expect(stage("specify")).toMatchObject({
      creatable: [
        { documentType: "powerhouse/document-model", label: "Document model" },
        { documentType: "powerhouse/app", label: "App" },
      ],
    });
    expect(stage("build")).toMatchObject({ creatable: [] });
    expect(creatableTypes(STAGES[0].documentTypes, undefined)).toEqual([]);
  });

  it("counts only stage documents as specifications", () => {
    expect(
      hasSpecifications([
        file("p", "pizza-plaza", "powerhouse/package"),
        file("chat", "Session 1", "powerhouse/chat-session"),
      ]),
    ).toBe(false);
    expect(hasSpecifications(pizza)).toBe(true);
  });
});
