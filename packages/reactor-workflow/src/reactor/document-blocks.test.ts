import { describe, expect, it } from "vitest";
import {
  documentSummary,
  parseActions,
  parseDispatchPayload,
  resolveDocumentId,
} from "./document-blocks.js";

describe("parseActions", () => {
  it("passes real arrays through", () => {
    expect(
      parseActions([{ type: "SET_NAME", input: { name: "x" } }], "b"),
    ).toEqual([{ type: "SET_NAME", input: { name: "x" }, scope: undefined }]);
  });

  it("parses JSON text, including fenced LLM output", () => {
    const fenced =
      '```json\n[{"type": "SET_WORKFLOW_STATUS", "input": {"status": "DISABLED"}}]\n```';
    expect(parseActions(fenced, "b")).toEqual([
      {
        type: "SET_WORKFLOW_STATUS",
        input: { status: "DISABLED" },
        scope: undefined,
      },
    ]);
  });

  it("wraps a single action object into a list", () => {
    expect(parseActions('{"type": "T", "input": {}}', "b")).toEqual([
      { type: "T", input: {}, scope: undefined },
    ]);
    expect(parseActions('{"actions": [{"type": "T"}]}', "b")).toEqual([
      { type: "T", input: undefined, scope: undefined },
    ]);
  });

  it("rejects non-JSON strings and typeless entries", () => {
    expect(() => parseActions("disable it please", "b")).toThrow(
      "not valid JSON",
    );
    expect(() => parseActions('[{"input": {}}]', "b")).toThrow(
      'needs a string "type"',
    );
  });
});

const doc = (header: Record<string, unknown>, global: unknown) =>
  ({ header, state: { global } }) as never;

describe("documentSummary", () => {
  it("prefers the state name over a lagging header name", () => {
    expect(
      documentSummary(
        doc({ id: "d1", documentType: "powerhouse/workflow", name: "Workflow 5", slug: "" }, { name: "Renamed" }),
        false,
      ),
    ).toEqual({
      documentId: "d1",
      documentType: "powerhouse/workflow",
      name: "Renamed",
      slug: "",
    });
  });

  it("falls back to the header name and includes state on demand", () => {
    expect(
      documentSummary(
        doc({ id: "d2", documentType: "t", name: "Header", slug: "s" }, { count: 1 }),
        true,
      ),
    ).toEqual({
      documentId: "d2",
      documentType: "t",
      name: "Header",
      slug: "s",
      state: { count: 1 },
    });
  });
});

describe("parseDispatchPayload", () => {
  it("reads a target documentId out of an LLM payload", () => {
    const text =
      '```json\n{"documentId": "abc", "actions": [{"type": "SET_NAME", "input": {"name": "n"}}]}\n```';
    expect(parseDispatchPayload(text, "b")).toEqual({
      documentId: "abc",
      actions: [{ type: "SET_NAME", input: { name: "n" }, scope: undefined }],
    });
  });

  it("leaves documentId undefined for a bare action list", () => {
    expect(parseDispatchPayload([{ type: "T" }], "b")).toEqual({
      documentId: undefined,
      actions: [{ type: "T", input: undefined, scope: undefined }],
    });
  });

  it("returns an empty action list when the model declines", () => {
    expect(parseDispatchPayload('{"actions": []}', "b").actions).toEqual([]);
  });
});

describe("resolveDocumentId", () => {
  const id = "f7b141f3-3504-47b4-912c-08a132656a7c";

  it("pulls a uuid out of model prose, quotes or fences", () => {
    for (const text of [
      id,
      `  ${id}\n`,
      `"${id}"`,
      "```\n" + id + "\n```",
      `The document you want is ${id}, I think.`,
      `{"documentId": "${id}"}`,
    ]) {
      expect(resolveDocumentId(text), text).toBe(id);
    }
  });

  it("keeps a bare slug and rejects empties", () => {
    expect(resolveDocumentId(" my-drive ")).toBe("my-drive");
    expect(resolveDocumentId("")).toBeUndefined();
    expect(resolveDocumentId(undefined)).toBeUndefined();
  });
});
