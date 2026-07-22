// @vitest-environment happy-dom

import type { Node } from "@powerhousedao/shared/document-drive";
import { describe, expect, it } from "vitest";
import type { ParsedFileInfo } from "./open-file-plan.js";
import { planOpenFileImports, storedFileName } from "./open-file-plan.js";

const fileNode = (
  name: string,
  documentType = "powerhouse/document-model",
  overrides: Partial<Node> = {},
): Node =>
  ({
    id: `node-${name}`,
    name,
    kind: "file",
    documentType,
    parentFolder: null,
    ...overrides,
  }) as Node;

const parsed = (
  overrides: Partial<Extract<ParsedFileInfo, { state: "parsed" }>> = {},
): ParsedFileInfo => ({
  state: "parsed",
  id: "doc-1",
  documentType: "powerhouse/document-model",
  headerName: "Header Name",
  ...overrides,
});

function entry(name: string, info: ParsedFileInfo | undefined, key = name) {
  return { key, file: new File(["x"], name), parsed: info };
}

describe("storedFileName", () => {
  it("strips everything from the first dot", () => {
    expect(storedFileName(new File([""], "doc.phdm.phd"))).toBe("doc");
    expect(storedFileName(new File([""], "budget.phd"))).toBe("budget");
  });

  it("normalizes an extension-only name to empty", () => {
    expect(storedFileName(new File([""], ".phd"))).toBe("");
  });
});

describe("planOpenFileImports", () => {
  it("marks unparsed files as checking", () => {
    const plan = planOpenFileImports({
      entries: [entry("doc.phd", undefined)],
      nodes: [],
      documentTypes: undefined,
    });
    expect(plan.get("doc.phd")).toEqual({ kind: "checking" });
  });

  it("marks invalid files", () => {
    const plan = planOpenFileImports({
      entries: [entry("doc.phd", { state: "invalid" })],
      nodes: [],
      documentTypes: undefined,
    });
    expect(plan.get("doc.phd")).toEqual({ kind: "invalid" });
  });

  it("marks unsupported document types, but is permissive without a list", () => {
    const strict = planOpenFileImports({
      entries: [entry("doc.phd", parsed({ documentType: "acme/thing" }))],
      nodes: [],
      documentTypes: ["powerhouse/document-model"],
    });
    expect(strict.get("doc.phd")).toEqual({ kind: "unsupported" });

    const permissive = planOpenFileImports({
      entries: [entry("doc.phd", parsed({ documentType: "acme/thing" }))],
      nodes: [],
      documentTypes: undefined,
    });
    expect(permissive.get("doc.phd")).toMatchObject({ kind: "ready" });
  });

  it("imports a clean file under its stored name, unrenamed", () => {
    const plan = planOpenFileImports({
      entries: [entry("budget.phd", parsed())],
      nodes: [fileNode("other")],
      documentTypes: undefined,
    });
    expect(plan.get("budget.phd")).toEqual({
      kind: "ready",
      finalName: "budget",
      duplicate: undefined,
      renamed: false,
    });
  });

  it("renames a name+type duplicate with the (copy) convention", () => {
    const plan = planOpenFileImports({
      entries: [entry("budget.phd", parsed())],
      nodes: [fileNode("budget")],
      documentTypes: undefined,
    });
    expect(plan.get("budget.phd")).toEqual({
      kind: "ready",
      finalName: "budget (copy) 1",
      duplicate: "name",
      renamed: true,
    });
  });

  it("does not treat a same-name file of a different type as a duplicate", () => {
    const plan = planOpenFileImports({
      entries: [entry("budget.phd", parsed())],
      nodes: [fileNode("budget", "acme/other-type")],
      documentTypes: undefined,
    });
    expect(plan.get("budget.phd")).toMatchObject({
      finalName: "budget",
      duplicate: undefined,
      renamed: false,
    });
  });

  it("flags an id duplicate without renaming when the name is free", () => {
    const plan = planOpenFileImports({
      entries: [entry("budget.phd", parsed({ id: "existing-id" }))],
      nodes: [
        fileNode("other", "powerhouse/document-model", { id: "existing-id" }),
      ],
      documentTypes: undefined,
    });
    expect(plan.get("budget.phd")).toEqual({
      kind: "ready",
      finalName: "budget",
      duplicate: "id",
      renamed: false,
    });
  });

  it("ignores duplicates outside the drive root", () => {
    const plan = planOpenFileImports({
      entries: [entry("budget.phd", parsed())],
      nodes: [
        fileNode("budget", "powerhouse/document-model", {
          parentFolder: "folder-1",
        }),
      ],
      documentTypes: undefined,
    });
    expect(plan.get("budget.phd")).toMatchObject({
      finalName: "budget",
      duplicate: undefined,
    });
  });

  it("accumulates assigned names within a batch even without drive collisions", () => {
    const plan = planOpenFileImports({
      entries: [
        entry("budget.phd", parsed({ id: "a" }), "k1"),
        entry("budget.phd", parsed({ id: "b" }), "k2"),
      ],
      nodes: [],
      documentTypes: undefined,
    });
    expect(plan.get("k1")).toMatchObject({ finalName: "budget" });
    expect(plan.get("k2")).toMatchObject({
      finalName: "budget (copy) 1",
      renamed: true,
    });
  });

  it("counts drive collisions and batch assignments together", () => {
    const plan = planOpenFileImports({
      entries: [
        entry("budget.phd", parsed({ id: "a" }), "k1"),
        entry("budget.phd", parsed({ id: "b" }), "k2"),
      ],
      nodes: [fileNode("budget")],
      documentTypes: undefined,
    });
    expect(plan.get("k1")).toMatchObject({ finalName: "budget (copy) 1" });
    expect(plan.get("k2")).toMatchObject({ finalName: "budget (copy) 2" });
  });

  it("keeps model-missing files importable and in the naming batch", () => {
    const plan = planOpenFileImports({
      entries: [
        entry("budget.phd", { state: "model-missing" }, "k1"),
        entry("budget.phd", { state: "model-missing" }, "k2"),
      ],
      nodes: [fileNode("budget")],
      documentTypes: ["powerhouse/document-model"],
    });
    // No duplicate check possible (header unknown) — drive names not consulted.
    expect(plan.get("k1")).toEqual({
      kind: "ready",
      finalName: "budget",
      renamed: false,
    });
    // But batch-internal collisions are still resolved.
    expect(plan.get("k2")).toMatchObject({ finalName: "budget (copy) 1" });
  });

  it("falls back to the header name for extension-only file names", () => {
    const plan = planOpenFileImports({
      entries: [entry(".phd", parsed({ headerName: "Header Name" }))],
      nodes: [],
      documentTypes: undefined,
    });
    expect(plan.get(".phd")).toMatchObject({ finalName: "Header Name" });
  });
});
