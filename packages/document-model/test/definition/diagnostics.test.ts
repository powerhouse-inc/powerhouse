import type {
  DefinitionDiagnostic,
  DefinitionDiagnosticPhase,
  DefinitionDiagnosticSeverity,
} from "@powerhousedao/shared/document-model";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DEFINITION_DIAGNOSTIC_CODES,
  DefinitionDiagnosticCollector,
  type DefinitionDiagnosticCode,
  type DefinitionDiagnosticInput,
  DocumentModelDefinitionError,
  capCodePoints,
  failDefinition,
  compareDefinitionDiagnostics,
  compareDefinitionPaths,
  createDiagnostic,
  formatDefinitionDiagnostic,
  sortDefinitionDiagnostics,
} from "../../src/definition/diagnostics.js";

const codes = Object.keys(DEFINITION_DIAGNOSTIC_CODES);

const reportOnlyCodes: readonly DefinitionDiagnosticCode[] = [
  "PH-GQL-COORDINATE-OWNED",
  "PH-GQL-SHARED-DEFINITION-MISMATCH",
  "PH-SCALAR-UNREGISTERED",
  "PH-SCALAR-RESOLVER-SHADOWED",
  "PH-SCALAR-COERCION-NORMALIZES",
  "PH-SCALAR-VALUE-NOT-JSON",
  "PH-SCALAR-POSITION-UNSUPPORTED",
  "PH-DM-IDENTITY-REUSED",
];

describe("DEFINITION_DIAGNOSTIC_CODES", () => {
  it("is frozen and every code carries the PH- prefix", () => {
    expect(Object.isFrozen(DEFINITION_DIAGNOSTIC_CODES)).toBe(true);
    expect(codes.length).toBe(51);
    for (const code of codes) {
      expect(code).toMatch(/^PH-[A-Z0-9-]+$/);
    }
    expect(new Set(codes).size).toBe(codes.length);
    expect(
      Object.isFrozen(DEFINITION_DIAGNOSTIC_CODES["PH-AUTH-UNSUPPORTED"]),
    ).toBe(true);
    expect(() => {
      // @ts-expect-error the catalog is readonly at every depth
      DEFINITION_DIAGNOSTIC_CODES["PH-AUTH-UNSUPPORTED"].severity = "warning";
    }).toThrow(TypeError);
  });

  it("marks report-only and X-scalar rows as warnings and everything else as errors", () => {
    for (const code of codes as DefinitionDiagnosticCode[]) {
      const expected: DefinitionDiagnosticSeverity = reportOnlyCodes.includes(
        code,
      )
        ? "warning"
        : "error";
      expect(DEFINITION_DIAGNOSTIC_CODES[code].severity, code).toBe(expected);
    }
  });

  it("assigns phases by where the check runs", () => {
    const phases: Record<DefinitionDiagnosticCode, DefinitionDiagnosticPhase> =
      {
        "PH-CONFIG-SOURCES-MISSING": "configuration",
        "PH-CONFIG-VERSION-UNSUPPORTED": "configuration",
        "PH-CONFIG-SOURCE-INVALID": "configuration",
        "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE": "configuration",
        "PH-CONFIG-DUPLICATE-SOURCE": "configuration",
        "PH-IMPORT-FAILED": "import",
        "PH-DEF-FIELD-OPTION-UNSUPPORTED": "definition",
        "PH-DEF-TYPE-AS-FIELD": "definition",
        "PH-DEF-OPTION-INVALID": "definition",
        "PH-DEF-NAME-INVALID": "definition",
        "PH-DEF-FIELD-INVALID": "definition",
        "PH-DEF-REFERENCE-TARGET-INVALID": "definition",
        "PH-DEF-ENUM-VALUES-INVALID": "definition",
        "PH-DEF-UNION-MEMBERS-INVALID": "definition",
        "PH-DEF-IMPLEMENTS-INVALID": "definition",
        "PH-SCALAR-DECLARATION-INVALID": "definition",
        "PH-DM-DUPLICATE-ACTION": "definition",
        "PH-DM-DUPLICATE-NAME": "definition",
        "PH-DM-IDENTITY-INVALID": "definition",
        "PH-DM-IDENTITY-REUSED": "definition",
        "PH-DM-STATE-ROOT-INVALID": "definition",
        "PH-DM-SCOPE-UNSUPPORTED": "definition",
        "PH-DM-DECLARATION-INVALID": "definition",
        "PH-DM-INITIAL-VALUE-INVALID": "definition",
        "PH-DM-TYPE-POSITION-INVALID": "definition",
        "PH-DM-DEFAULT-UNSUPPORTED": "definition",
        "PH-DM-COMPATIBILITY-INVALID": "definition",
        "PH-SG-DEFINITION-INVALID": "definition",
        "PH-SG-SCHEMA-INVALID": "composition",
        "PH-SG-ENTRY-INVALID": "definition",
        "PH-SG-COMPUTED-FIELD-INVALID": "definition",
        "PH-GQL-COORDINATE-OWNED": "composition",
        "PH-GQL-SHARED-DEFINITION-MISMATCH": "composition",
        "PH-GQL-FEDERATION-UNSUPPORTED": "composition",
        "PH-SCALAR-AUTHOR-DECLARATION-UNSUPPORTED": "definition",
        "PH-SCALAR-DUPLICATE-NAME": "package",
        "PH-SCALAR-UNREGISTERED": "composition",
        "PH-SCALAR-RESOLVER-SHADOWED": "composition",
        "PH-SCALAR-COERCION-NORMALIZES": "definition",
        "PH-SCALAR-VALUE-NOT-JSON": "definition",
        "PH-SCALAR-ZERO-VALUE-INVALID": "definition",
        "PH-SCALAR-POSITION-UNSUPPORTED": "definition",
        "PH-SCALAR-FACTORY-AS-FIELD": "definition",
        "PH-PKG-LOGICAL-COLLISION": "package",
        "PH-PKG-DEFINITION-UNRECOGNIZED": "package",
        "PH-PKG-DEFINITION-UNINSPECTABLE": "package",
        "PH-PKG-TYPECHECK-FAILED": "typecheck",
        "PH-PKG-RELEASE-EVIDENCE-MISSING": "package",
        "PH-PKG-PACKED-CONSUMER-FAILED": "package",
        "PH-REPLAY-DIVERGENCE": "replay",
        "PH-AUTH-UNSUPPORTED": "authorization",
      };
    for (const [code, phase] of Object.entries(phases)) {
      expect(
        DEFINITION_DIAGNOSTIC_CODES[code as DefinitionDiagnosticCode].phase,
        code,
      ).toBe(phase);
    }
    expect(Object.keys(phases).sort()).toStrictEqual([...codes].sort());
  });

  it("types the diagnostic builder on the catalog keys", () => {
    expectTypeOf<DefinitionDiagnosticInput["code"]>().toEqualTypeOf<
      keyof typeof DEFINITION_DIAGNOSTIC_CODES
    >();
    const outside = {
      // @ts-expect-error a code outside the catalog cannot be constructed
      code: "PH-MADE-UP",
      path: [],
      message: "m",
      repair: "r",
    } satisfies DefinitionDiagnosticInput;
    expect(outside.code).toBe("PH-MADE-UP");
  });
});

describe("createDiagnostic", () => {
  it("fills severity and phase from the catalog and omits absent properties", () => {
    const path = ["modules", "lineItems"];
    const diagnostic = createDiagnostic({
      code: "PH-DM-IDENTITY-INVALID",
      path,
      message: "Module key is not NFC.",
      repair: 'Rewrite the module key as "lineItems".',
    });
    expect(diagnostic).toStrictEqual({
      code: "PH-DM-IDENTITY-INVALID",
      severity: "error",
      phase: "definition",
      path: ["modules", "lineItems"],
      message: "Module key is not NFC.",
      repair: 'Rewrite the module key as "lineItems".',
    });
    expect(Object.keys(diagnostic)).toStrictEqual([
      "code",
      "severity",
      "phase",
      "path",
      "message",
      "repair",
    ]);
    path.push("operations");
    expect(diagnostic.path).toStrictEqual(["modules", "lineItems"]);
  });

  it("keeps optional members in a fixed property order and caps the summaries", () => {
    const diagnostic = createDiagnostic({
      repair: "Rename one of the operations.",
      related: [
        { source: { specifier: "./b.ts" }, path: ["x"], message: "first" },
      ],
      received: "r".repeat(600),
      message: "Duplicate action.",
      expected: "e".repeat(600),
      definition: { kind: "document-model", key: "powerhouse/invoice" },
      source: { specifier: "./a.ts", exportPath: ["invoice"] },
      path: ["modules", "a", "operations", "b"],
      code: "PH-DM-DUPLICATE-ACTION",
    });
    expect(Object.keys(diagnostic)).toStrictEqual([
      "code",
      "severity",
      "phase",
      "source",
      "definition",
      "path",
      "message",
      "expected",
      "received",
      "repair",
      "related",
    ]);
    expect(diagnostic.expected).toBe("e".repeat(512));
    expect(diagnostic.received).toBe("r".repeat(512));
    expect(diagnostic.related).toStrictEqual([
      { source: { specifier: "./b.ts" }, path: ["x"], message: "first" },
    ]);
  });

  it("owns nested wire values and omits their explicit undefined properties", () => {
    const exportPath = ["invoice"];
    const source = {
      specifier: "./a.ts" as const,
      exportPath,
    };
    const definition: {
      kind: "document-model";
      key: string;
      version?: number;
    } = {
      kind: "document-model",
      key: "powerhouse/invoice",
      version: 1,
    };
    const diagnostic = createDiagnostic({
      code: "PH-DM-IDENTITY-INVALID",
      source,
      definition,
      path: [],
      message: "Invalid identity.",
      repair: "Fix the identity.",
      related: [
        {
          source: { specifier: "./b.ts", exportPath: undefined },
          path: [],
          message: "Related declaration.",
        },
      ],
    });

    exportPath.push("changed");
    definition.key = "changed";
    definition.version = 2;

    expect(diagnostic.source).toStrictEqual({
      specifier: "./a.ts",
      exportPath: ["invoice"],
    });
    expect(diagnostic.definition).toStrictEqual({
      kind: "document-model",
      key: "powerhouse/invoice",
      version: 1,
    });
    expect(diagnostic.related?.[0].source).toStrictEqual({
      specifier: "./b.ts",
    });

    const withUndefined = createDiagnostic({
      code: "PH-DM-IDENTITY-INVALID",
      source: { specifier: "./a.ts", exportPath: undefined },
      definition: {
        kind: "document-model",
        key: "powerhouse/invoice",
        version: undefined,
      },
      path: [],
      message: "Invalid identity.",
      repair: "Fix the identity.",
    });
    expect(Object.hasOwn(withUndefined.source ?? {}, "exportPath")).toBe(false);
    expect(Object.hasOwn(withUndefined.definition ?? {}, "version")).toBe(
      false,
    );
  });
});

describe("capCodePoints", () => {
  const loneSurrogate =
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

  it("returns short values unchanged", () => {
    expect(capCodePoints("abc")).toBe("abc");
    expect(capCodePoints("a".repeat(512))).toBe("a".repeat(512));
  });

  it("cuts on a code-point boundary, never inside a surrogate pair", () => {
    const value = `${"a".repeat(511)}😀b`;
    const capped = capCodePoints(value);
    expect([...capped]).toHaveLength(512);
    expect(capped.endsWith("😀")).toBe(true);
    expect(capped).not.toMatch(loneSurrogate);
    expect(capCodePoints(`${"a".repeat(512)}😀`)).toBe("a".repeat(512));
  });

  it("keeps a combining sequence renderable at the cut", () => {
    const value = `${"a".repeat(511)}e\u0301z`;
    const capped = capCodePoints(value);
    expect([...capped]).toHaveLength(512);
    expect(capped.endsWith("e")).toBe(true);
    expect(capped.normalize("NFC")).toBe(capped);
    expect(
      capCodePoints(`${"a".repeat(510)}e\u0301z`).endsWith("e\u0301"),
    ).toBe(true);
  });

  it("accepts an explicit limit", () => {
    expect(capCodePoints("😀😀😀", 2)).toBe("😀😀");
    expect(capCodePoints("abc", 0)).toBe("");
    expect(capCodePoints("abcdef", -1)).toBe("");
  });
});

function diagnostic(
  input: Partial<DefinitionDiagnosticInput> & { readonly message: string },
): DefinitionDiagnostic {
  return createDiagnostic({
    code: "PH-DM-STATE-ROOT-INVALID",
    path: [],
    repair: "Fix it.",
    ...input,
  });
}

const sourceA = { specifier: "./a.ts" } as const;
const sourceB = { specifier: "./b.ts" } as const;
const invoice = { kind: "document-model", key: "powerhouse/invoice" } as const;

const expectedOrder: readonly DefinitionDiagnostic[] = [
  diagnostic({
    message: "no source, code A",
    code: "PH-CONFIG-SOURCES-MISSING",
  }),
  diagnostic({ message: "no source, code B", code: "PH-IMPORT-FAILED" }),
  diagnostic({ message: "a, no definition", source: sourceA }),
  diagnostic({
    message: "a, document-model, no version",
    source: sourceA,
    definition: invoice,
  }),
  diagnostic({
    message: "a, document-model v1, fields[2]",
    source: sourceA,
    definition: { ...invoice, version: 1 },
    path: ["fields", 2],
  }),
  diagnostic({
    message: "a, document-model v1, fields[10]",
    source: sourceA,
    definition: { ...invoice, version: 1 },
    path: ["fields", 10],
  }),
  diagnostic({
    message: "a, document-model v1, fields[10].name, code DM-DUPLICATE-ACTION",
    source: sourceA,
    definition: { ...invoice, version: 1 },
    path: ["fields", 10, "name"],
    code: "PH-DM-DUPLICATE-ACTION",
  }),
  diagnostic({
    message:
      "a, document-model v1, fields[10].name, code DM-STATE-ROOT-INVALID",
    source: sourceA,
    definition: { ...invoice, version: 1 },
    path: ["fields", 10, "name"],
  }),
  diagnostic({
    message: "a, document-model v2",
    source: sourceA,
    definition: { ...invoice, version: 2 },
  }),
  diagnostic({
    message: "a, subgraph",
    source: sourceA,
    definition: { kind: "subgraph", key: "billing" },
  }),
  diagnostic({
    message: "a with export path",
    source: { ...sourceA, exportPath: ["x"] },
  }),
  diagnostic({ message: "b", source: sourceB }),
];

function permute<T>(list: readonly T[], seed: number): T[] {
  const copy = [...list];
  let state = seed;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const swap = state % (index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

describe("sortDefinitionDiagnostics", () => {
  it("orders by source, definition, version, path, then code, with sourceless first", () => {
    for (const seed of [1, 7, 42]) {
      const shuffled = permute(expectedOrder, seed);
      expect(shuffled.map((d) => d.message)).not.toStrictEqual(
        expectedOrder.map((d) => d.message),
      );
      expect(sortDefinitionDiagnostics(shuffled)).toStrictEqual(expectedOrder);
    }
    expect(
      sortDefinitionDiagnostics([...expectedOrder].reverse()),
    ).toStrictEqual(expectedOrder);
  });

  it("compares path indices numerically and puts indices before keys", () => {
    expect(compareDefinitionPaths(["fields", 2], ["fields", 10])).toBe(-1);
    expect(compareDefinitionPaths(["fields", 10], ["fields", "name"])).toBe(-1);
    expect(compareDefinitionPaths(["fields"], ["fields", 0])).toBe(-1);
    expect(compareDefinitionPaths(["Z"], ["a"])).toBe(-1);
    expect(compareDefinitionPaths([], [])).toBe(0);
  });

  it("is stable for diagnostics that tie on every key", () => {
    const first = diagnostic({ message: "first", source: sourceA });
    const second = diagnostic({ message: "second", source: sourceA });
    expect(compareDefinitionDiagnostics(first, second)).toBe(0);
    expect(sortDefinitionDiagnostics([first, second])).toStrictEqual([
      first,
      second,
    ]);
    expect(sortDefinitionDiagnostics([second, first])).toStrictEqual([
      second,
      first,
    ]);
  });

  it("returns byte-identical output across runs and input key orders", () => {
    const rebuilt = expectedOrder.map((d) =>
      createDiagnostic({
        repair: d.repair,
        message: d.message,
        path: d.path,
        code: d.code as DefinitionDiagnosticCode,
        ...(d.definition && { definition: d.definition }),
        ...(d.source && { source: d.source }),
      }),
    );
    const left = JSON.stringify(
      sortDefinitionDiagnostics(permute(expectedOrder, 3)),
    );
    const right = JSON.stringify(
      sortDefinitionDiagnostics(permute(rebuilt, 9)),
    );
    expect(left).toBe(right);
    expect(JSON.stringify(sortDefinitionDiagnostics(expectedOrder))).toBe(left);
  });

  it("does not mutate its input", () => {
    const input = permute(expectedOrder, 5);
    const snapshot = [...input];
    sortDefinitionDiagnostics(input);
    expect(input).toStrictEqual(snapshot);
  });
});

describe("formatDefinitionDiagnostic", () => {
  it("renders one line with source, definition, pointer, summaries, related, and repair", () => {
    const line = formatDefinitionDiagnostic(
      createDiagnostic({
        code: "PH-DM-DUPLICATE-ACTION",
        source: { specifier: "./src/invoice.ts", exportPath: ["invoice"] },
        definition: { ...invoice, version: 1 },
        path: ["modules", "line/items", "operations", 1],
        message: "Two operations derive ADD_LINE_ITEM.",
        expected: "distinct action types",
        received: "ADD_LINE_ITEM twice",
        repair: "Rename one of the operations.",
        related: [
          {
            source: { specifier: "./src/invoice.ts" },
            path: ["modules", "line/items", "operations", 0],
            message: "First declared here.",
          },
        ],
      }),
    );
    expect(line).toBe(
      "PH-DM-DUPLICATE-ACTION [error/definition] ./src/invoice.ts#/invoice document-model powerhouse/invoice@1 /modules/line~1items/operations/1: Two operations derive ADD_LINE_ITEM. Expected: distinct action types Received: ADD_LINE_ITEM twice Related: ./src/invoice.ts /modules/line~1items/operations/0: First declared here. Repair: Rename one of the operations.",
    );
  });

  it("keeps a diagnostic on one line when its text contains newlines", () => {
    const line = formatDefinitionDiagnostic(
      createDiagnostic({
        code: "PH-DM-STATE-ROOT-INVALID",
        path: [],
        message: "first line\nsecond   line",
        expected: "a\tb",
        repair: "do\n  this",
      }),
    );
    expect(line).not.toContain("\n");
    expect(line).toBe(
      "PH-DM-STATE-ROOT-INVALID [error/definition] <config> (root): first line second line Expected: a b Repair: do this",
    );
  });

  it("renders a sourceless root diagnostic as <config> (root)", () => {
    expect(
      formatDefinitionDiagnostic(
        createDiagnostic({
          code: "PH-CONFIG-SOURCES-MISSING",
          path: [],
          message: "No sources.",
          repair: "Add definitionSources to powerhouse.config.json.",
        }),
      ),
    ).toBe(
      "PH-CONFIG-SOURCES-MISSING [error/configuration] <config> (root): No sources. Repair: Add definitionSources to powerhouse.config.json.",
    );
  });
});

describe("DocumentModelDefinitionError", () => {
  it("exposes every diagnostic sorted and lists each one in the message", () => {
    const error = new DocumentModelDefinitionError([
      expectedOrder[3],
      expectedOrder[0],
      expectedOrder[11],
    ]);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DocumentModelDefinitionError");
    expect(error.diagnostics).toStrictEqual([
      expectedOrder[0],
      expectedOrder[3],
      expectedOrder[11],
    ]);
    const lines = error.message.split("\n");
    expect(lines[0]).toBe(
      "Document model definition failed with 3 diagnostics:",
    );
    expect(lines.slice(1)).toStrictEqual(
      error.diagnostics.map(formatDefinitionDiagnostic),
    );
  });

  it("cannot be constructed without a diagnostic", () => {
    expect(
      () =>
        // @ts-expect-error at least one diagnostic is required
        new DocumentModelDefinitionError([]),
    ).toThrow(
      new TypeError(
        "DocumentModelDefinitionError requires at least one diagnostic.",
      ),
    );
    expect(
      new DocumentModelDefinitionError([expectedOrder[0]]).message,
    ).toMatch(/^Document model definition failed with 1 diagnostic:\n/);
  });
});

describe("DefinitionDiagnosticCollector", () => {
  const input = {
    code: "PH-DM-DECLARATION-INVALID",
    path: ["b"],
    message: "m",
    repair: "r",
  } as const;

  it("throws one sorted error carrying every collected diagnostic", () => {
    const collector = new DefinitionDiagnosticCollector({
      kind: "document-model",
      key: "test/collector",
      version: 1,
    });
    collector.add({ ...input, path: ["b"] });
    collector.add({ ...input, path: ["a"] });
    expect(collector.size).toBe(2);
    let caught: unknown;
    try {
      collector.throwIfFailed();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DocumentModelDefinitionError);
    const thrown = caught as DocumentModelDefinitionError;
    expect(thrown.diagnostics.map((entry) => entry.path)).toStrictEqual([
      ["a"],
      ["b"],
    ]);
    // The definition reference is attached to everything it collects.
    expect(thrown.diagnostics[0].definition).toStrictEqual({
      kind: "document-model",
      key: "test/collector",
      version: 1,
    });
  });

  it("does not fail a declaration on a report-only diagnostic", () => {
    const collector = new DefinitionDiagnosticCollector();
    collector.add({
      code: "PH-SCALAR-UNREGISTERED",
      path: [],
      message: "report only",
      repair: "none",
    });
    expect(collector.size).toBe(1);
    expect(collector.diagnostics[0].severity).toBe("warning");
    expect(() => collector.throwIfFailed()).not.toThrow();
  });

  it("carries a report-only diagnostic inside the error an error raises", () => {
    const collector = new DefinitionDiagnosticCollector();
    collector.add({
      code: "PH-SCALAR-UNREGISTERED",
      path: ["a"],
      message: "report only",
      repair: "none",
    });
    collector.add({ ...input, path: ["b"] });
    let caught: unknown;
    try {
      collector.throwIfFailed();
    } catch (error) {
      caught = error;
    }
    expect(
      (caught as DocumentModelDefinitionError).diagnostics.map(
        (entry) => entry.severity,
      ),
    ).toStrictEqual(["warning", "error"]);
  });

  it("captures a builder failure instead of losing what it holds", () => {
    const collector = new DefinitionDiagnosticCollector();
    collector.add({ ...input, path: ["first"] });
    const value = collector.capture(() =>
      failDefinition({
        code: "PH-DEF-NAME-INVALID",
        path: ["second"],
        message: "from a builder",
        repair: "rename",
      }),
    );
    expect(value).toBeUndefined();
    // Sorted by path: "first" precedes "second".
    expect(collector.diagnostics.map((entry) => entry.code)).toStrictEqual([
      "PH-DM-DECLARATION-INVALID",
      "PH-DEF-NAME-INVALID",
    ]);
    expect(collector.capture(() => "kept")).toBe("kept");
    expect(() =>
      collector.capture(() => {
        throw new TypeError("not a definition error");
      }),
    ).toThrow(TypeError);
  });
});
