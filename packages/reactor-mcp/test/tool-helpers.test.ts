import { describe, expect, it } from "vitest";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { z } from "zod";
import {
  applyJsonPath,
  defineTool,
  documentView,
  isRemoteDriveUrlAllowed,
  isWriteTool,
  JsonPathError,
  operationSchemaSlice,
  ReactorToolError,
  suggestNames,
  toMcpTool,
  toReactorToolError,
  trimValue,
  validateActions,
} from "../src/index.js";

const spec = {
  modules: [
    {
      name: "base",
      operations: [
        { name: "SET_NAME", scope: "global" },
        { name: "SET_ICON", scope: "global" },
      ],
    },
    { name: "items", operations: [{ name: "ADD_ITEM", scope: "local" }] },
  ],
  versions: [1, 2, 3],
};

describe("applyJsonPath", () => {
  it.each([
    ["$", spec],
    ["$.modules[0].name", "base"],
    ["$['modules'][1]['name']", "items"],
    ["$.modules[*].name", ["base", "items"]],
    ["$.modules.*.name", ["base", "items"]],
    ["$.versions[-1]", 3],
    ["$.versions[(@.length-2)]", 2],
    ["$.versions[0,2]", [1, 3]],
    ["$..operations[*].name", ["SET_NAME", "SET_ICON", "ADD_ITEM"]],
    ["$.modules[*].operations[?(@.scope=='local')].name", ["ADD_ITEM"]],
    ["$.modules[?(@.name=='none')].name", []],
    ['$..operations[?(@.name != "SET_NAME")].name', ["SET_ICON", "ADD_ITEM"]],
    ["$.versions[?(@ > 1)]", [2, 3]],
    ["$.modules[?(@.operations)].name", ["base", "items"]],
    ["$.missing", undefined],
  ])("%s", (path, expected) => {
    expect(applyJsonPath(spec, path)).toEqual(expected);
  });

  it("rejects paths it cannot parse", () => {
    expect(() => applyJsonPath(spec, "modules")).toThrow(JsonPathError);
    expect(() => applyJsonPath(spec, "$.modules[0")).toThrow(JsonPathError);
  });
});

describe("trimValue", () => {
  it("caps arrays, strings and depth, and says so", () => {
    const { value, truncated } = trimValue(
      { list: [1, 2, 3, 4], text: "abcdef", deep: { a: { b: 1 } } },
      { maxArrayItems: 2, maxStringLength: 3, maxDepth: 2 },
    );
    expect(truncated).toBe(true);
    expect(value).toEqual({
      list: [1, 2, "…2 more items"],
      text: "abc…[+3 chars]",
      deep: { a: "[object with keys: b]" },
    });
  });

  it("keeps empty arrays and objects past the depth limit", () => {
    expect(trimValue({ a: { b: [], c: {} } }, { maxDepth: 2 })).toEqual({
      value: { a: { b: [], c: {} } },
      truncated: false,
    });
  });

  it("leaves small values untouched", () => {
    expect(trimValue({ a: [1], b: "x" })).toEqual({
      value: { a: [1], b: "x" },
      truncated: false,
    });
  });
});

describe("suggestNames", () => {
  it("ranks containment and near misses", () => {
    const names = ["SET_MODEL_NAME", "SET_MODEL_ID", "ADD_MODULE"];
    expect(suggestNames("SET_MODEL_NAM", names)[0]).toBe("SET_MODEL_NAME");
    expect(suggestNames("SET_NAME", names)).toContain("SET_MODEL_NAME");
    expect(suggestNames("ZZZZZZZZZZZZZZZZZZZZ", names)).toEqual([]);
  });
});

describe("toReactorToolError", () => {
  const named = (name: string, message: string) =>
    Object.assign(new Error(message), { name });

  it.each([
    [named("DocumentNotFoundError", "x"), "NOT_FOUND"],
    [named("ReactorAccessDeniedError", "x"), "FORBIDDEN"],
    [named("AuthorizationDeniedError", "x"), "FORBIDDEN"],
    [named("ExcessiveReshuffleError", "x"), "CONFLICT"],
    [named("InvalidActionInputZodError", "x"), "INVALID_ACTION"],
    [new Error("Document model module not found for type: a/b"), "NOT_FOUND"],
    [new Error("boom"), "REDUCER_ERROR"],
    ["a string", "REDUCER_ERROR"],
  ])("classifies %s", (error, code) => {
    expect(toReactorToolError(error).code).toBe(code);
  });

  it("classifies a failed job by the error that failed it", () => {
    const failed = Object.assign(named("JobFailedError", "x"), {
      job: { error: { name: "DocumentNotFoundError", message: "x" } },
    });
    expect(toReactorToolError(failed).code).toBe("NOT_FOUND");
  });

  // As one crosses a worker boundary: the name and fields, not the class.
  const foreign = () =>
    Object.assign(named("ReactorToolError", "refused"), {
      code: "FORBIDDEN",
      failures: [{ index: 1, type: "X", code: "FORBIDDEN", errors: ["no"] }],
    });

  it("rebuilds a foreign ReactorToolError with its code and failures", () => {
    const error = toReactorToolError(foreign());
    expect(error).toBeInstanceOf(ReactorToolError);
    expect(error.toJSON()).toEqual({
      code: "FORBIDDEN",
      message: "refused",
      failures: [{ index: 1, type: "X", code: "FORBIDDEN", errors: ["no"] }],
    });
  });

  it("reports a foreign ReactorToolError through the MCP adapter", async () => {
    const tool = defineTool({
      name: "throws",
      title: "Throws",
      description: "Throws a foreign tool error",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      annotations: {},
      execute: () => Promise.reject(foreign()),
    });
    const result = await toMcpTool(tool, {
      client: undefined as never,
    }).callback({});
    expect(result.isError).toBe(true);
    expect(result._meta?.error).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("documentView", () => {
  const long = "x".repeat(3000);
  const document = {
    header: { id: "d", documentType: "t", name: "n", revision: {} },
    state: { global: { reducer: long, items: Array.from({ length: 40 }) } },
  } as unknown as PHDocument;

  it("cuts long strings and arrays without a filter", () => {
    const view = documentView(document);
    expect(view.truncated).toBe(true);
    expect(JSON.stringify(view.state)).not.toContain(long);
  });

  it("returns a filter's match whole", () => {
    const reducer = documentView(document, { filter: "$.global.reducer" });
    expect(reducer.state).toBe(long);
    const items = documentView(document, { filter: "$.global.items" });
    expect(items.state).toHaveLength(40);
    expect(items.truncated).toBeUndefined();
  });

  it("still cuts an oversized match", () => {
    const huge = {
      ...document,
      state: { global: { reducer: "x".repeat(200_000) } },
    } as unknown as PHDocument;
    expect(documentView(huge, { filter: "$.global" }).truncated).toBe(true);
  });
});

describe("the any-scope placeholder", () => {
  const module =
    documentModelDocumentModelModule as unknown as DocumentModelModule;

  it("is refused as a scope", () => {
    const { actions, failures } = validateActions(module, [
      { type: "UNDO", scope: "any" },
      { type: "UNDO", scope: "local" },
    ]);
    expect(failures).toMatchObject([{ index: 0, code: "INVALID_ACTION" }]);
    expect(actions.map((a) => a.scope)).toEqual(["local"]);
  });

  it("is not shown to agents as a scope", () => {
    const slice = operationSchemaSlice(module, "UNDO");
    expect(slice.scope).toBe("global");
    expect(slice.description).toContain("any of the document's scopes");
  });
});

describe("isRemoteDriveUrlAllowed", () => {
  const url = new URL("https://drives.example.com/d/abc");

  it("denies without an allowlist and for non-http URLs", () => {
    expect(isRemoteDriveUrlAllowed(url, undefined)).toBe(false);
    expect(isRemoteDriveUrlAllowed(new URL("file:///etc/passwd"), "*")).toBe(
      false,
    );
  });

  it("matches origins, prefixes, patterns and predicates", () => {
    expect(isRemoteDriveUrlAllowed(url, "*")).toBe(true);
    expect(isRemoteDriveUrlAllowed(url, ["https://drives.example.com"])).toBe(
      true,
    );
    expect(
      isRemoteDriveUrlAllowed(url, ["https://drives.example.com/d/"]),
    ).toBe(true);
    expect(
      isRemoteDriveUrlAllowed(url, ["https://drives.example.com/x/"]),
    ).toBe(false);
    expect(isRemoteDriveUrlAllowed(url, ["https://example.com"])).toBe(false);
    expect(isRemoteDriveUrlAllowed(url, [/\.example\.com\//])).toBe(true);
    expect(isRemoteDriveUrlAllowed(url, (u) => u.hostname === "x")).toBe(false);
  });

  it("matches a path prefix only on a path boundary", () => {
    const allow = ["https://a.com/drives"];
    const at = (href: string) => isRemoteDriveUrlAllowed(new URL(href), allow);
    expect(at("https://a.com/drives")).toBe(true);
    expect(at("https://a.com/drives/x")).toBe(true);
    expect(at("https://a.com/drives-evil")).toBe(false);
    expect(at("https://a.com.evil.com/drives")).toBe(false);
  });

  it("answers the same for a global or sticky pattern every time", () => {
    for (const pattern of [/example\.com/g, /https/y]) {
      const answers = [1, 2, 3].map(() =>
        isRemoteDriveUrlAllowed(url, [pattern]),
      );
      expect(answers).toEqual([true, true, true]);
    }
  });
});

describe("isWriteTool", () => {
  it("treats only read-only tools as reads", () => {
    expect(isWriteTool({ readOnlyHint: true })).toBe(false);
    expect(isWriteTool({ readOnlyHint: false })).toBe(true);
    expect(isWriteTool(undefined)).toBe(true);
  });
});
