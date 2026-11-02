import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { describe, expect, expectTypeOf, it } from "vitest";
import { kernelDiagnostics } from "../../../src/definition/kernel/diagnostic-codes.js";
import {
  type DefinitionDiagnosticInput,
  DefinitionError,
  capCodePoints,
  compareDefinitionDiagnostics,
  compareDefinitionPaths,
  defineDiagnosticCatalog,
  formatDefinitionDiagnostic,
  sortDefinitionDiagnostics,
} from "../../../src/definition/kernel/diagnostics.js";

const testEntry = (meaning: string) =>
  ({ severity: "error", phase: "definition", meaning }) as const;

const catalog = defineDiagnosticCatalog(
  {
    "PH-DEF-FIELD-INVALID": testEntry("Sorts before PH-DEF-NAME-INVALID"),
    "PH-DEF-NAME-INVALID": testEntry("Sorts after PH-DEF-FIELD-INVALID"),
    "PH-DM-DUPLICATE-ACTION": testEntry("A test code"),
    "PH-DM-IDENTITY-INVALID": testEntry("A test code"),
    "PH-TEST-REPORT-ONLY": {
      severity: "warning",
      phase: "composition",
      meaning: "A report-only test code",
    },
  },
  kernelDiagnostics,
);

describe("defineDiagnosticCatalog", () => {
  it("freezes the catalog at every depth", () => {
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.codes)).toBe(true);
    expect(() => {
      // @ts-expect-error the catalog is readonly at every depth
      catalog.codes["PH-TEST-REPORT-ONLY"].severity = "error";
    }).toThrow(TypeError);
    expect(catalog.codes["PH-DEF-OPTION-INVALID"]).toBe(
      kernelDiagnostics.codes["PH-DEF-OPTION-INVALID"],
    );
  });

  it("refuses an own code that an inherited catalog already declares", () => {
    expect(() =>
      defineDiagnosticCatalog(
        {
          // @ts-expect-error the kernel already declares this code
          "PH-DEF-OPTION-INVALID": testEntry("A redefinition"),
        },
        kernelDiagnostics,
      ),
    ).toThrow(
      new TypeError(
        "Diagnostic code PH-DEF-OPTION-INVALID is already declared by a lower layer.",
      ),
    );
  });

  it("accepts exactly the inherited codes when a layer declares none of its own", () => {
    const inheritedOnly = defineDiagnosticCatalog({}, kernelDiagnostics);
    expect(Object.keys(inheritedOnly.codes)).toStrictEqual(
      Object.keys(kernelDiagnostics.codes),
    );
    expectTypeOf<
      Parameters<typeof inheritedOnly.create>[0]["code"]
    >().toEqualTypeOf<keyof typeof kernelDiagnostics.codes>();
  });

  it("types the diagnostic builder on its own keys", () => {
    expectTypeOf<Parameters<typeof catalog.create>[0]["code"]>().toEqualTypeOf<
      keyof typeof catalog.codes
    >();
    expect(() =>
      catalog.create({
        // @ts-expect-error a code outside the catalog cannot be constructed
        code: "PH-MADE-UP",
        path: [],
        message: "m",
        repair: "r",
      }),
    ).toThrow(TypeError);
  });

  it("throws one definition error from fail", () => {
    let caught: unknown;
    try {
      catalog.fail({
        code: "PH-DEF-NAME-INVALID",
        path: ["name"],
        message: "Bad name.",
        repair: "Rename it.",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DefinitionError);
    expect((caught as DefinitionError).diagnostics).toStrictEqual([
      {
        code: "PH-DEF-NAME-INVALID",
        severity: "error",
        phase: "definition",
        path: ["name"],
        message: "Bad name.",
        repair: "Rename it.",
      },
    ]);
  });
});

describe("catalog.create", () => {
  it("fills severity and phase from the catalog and omits absent properties", () => {
    const path = ["modules", "lineItems"];
    const diagnostic = catalog.create({
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

  it.each(
    Object.entries(catalog.codes).map(([code, entry]) => ({
      code: code as keyof typeof catalog.codes,
      severity: entry.severity,
      phase: entry.phase,
    })),
  )(
    "constructs $code with its reporting severity and phase",
    ({ code, severity, phase }) => {
      expect(
        catalog.create({
          code,
          path: ["entry"],
          message: "Check failed.",
          repair: "Fix the entry.",
        }),
      ).toStrictEqual({
        code,
        severity,
        phase,
        path: ["entry"],
        message: "Check failed.",
        repair: "Fix the entry.",
      });
    },
  );

  it("keeps optional members in a fixed property order and caps the summaries", () => {
    const diagnostic = catalog.create({
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
    const diagnostic = catalog.create({
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

    const withUndefined = catalog.create({
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
  input: Partial<DefinitionDiagnosticInput<keyof typeof catalog.codes>> & {
    readonly message: string;
  },
): DefinitionDiagnostic {
  return catalog.create({
    code: "PH-DEF-OPTION-INVALID",
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
    code: "PH-DEF-FIELD-INVALID",
  }),
  diagnostic({ message: "no source, code B", code: "PH-DEF-NAME-INVALID" }),
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
    message: "a, document-model v1, fields[10].name, code DM-IDENTITY-INVALID",
    source: sourceA,
    definition: { ...invoice, version: 1 },
    path: ["fields", 10, "name"],
    code: "PH-DM-IDENTITY-INVALID",
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
      catalog.create({
        repair: d.repair,
        message: d.message,
        path: d.path,
        code: d.code as keyof typeof catalog.codes,
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
      catalog.create({
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
      catalog.create({
        code: "PH-DEF-OPTION-INVALID",
        path: [],
        message: "first line\nsecond   line",
        expected: "a\tb",
        repair: "do\n  this",
      }),
    );
    expect(line).not.toContain("\n");
    expect(line).toBe(
      "PH-DEF-OPTION-INVALID [error/definition] (no source) (root): first line second line Expected: a b Repair: do this",
    );
  });

  it("renders a sourceless root diagnostic as (no source) (root)", () => {
    expect(
      formatDefinitionDiagnostic(
        catalog.create({
          code: "PH-DEF-NAME-INVALID",
          path: [],
          message: "Bad name.",
          repair: "Rename it.",
        }),
      ),
    ).toBe(
      "PH-DEF-NAME-INVALID [error/definition] (no source) (root): Bad name. Repair: Rename it.",
    );
  });
});

describe("DefinitionError", () => {
  it("exposes every diagnostic sorted and lists each one in the message", () => {
    const error = new DefinitionError([
      expectedOrder[3],
      expectedOrder[0],
      expectedOrder[11],
    ]);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DefinitionError");
    expect(error.diagnostics).toStrictEqual([
      expectedOrder[0],
      expectedOrder[3],
      expectedOrder[11],
    ]);
    const lines = error.message.split("\n");
    expect(lines[0]).toBe("Definition failed with 3 diagnostics:");
    expect(lines.slice(1)).toStrictEqual(
      error.diagnostics.map(formatDefinitionDiagnostic),
    );
  });

  it("cannot be constructed without a diagnostic", () => {
    expect(
      () =>
        // @ts-expect-error at least one diagnostic is required
        new DefinitionError([]),
    ).toThrow(
      new TypeError("DefinitionError requires at least one diagnostic."),
    );
    expect(new DefinitionError([expectedOrder[0]]).message).toMatch(
      /^Definition failed with 1 diagnostic:\n/,
    );
  });
});
