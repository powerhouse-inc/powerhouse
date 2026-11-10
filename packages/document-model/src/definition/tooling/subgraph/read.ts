import type {
  DefinitionDiagnostic,
  DefinitionSource,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";
import { describeReceived } from "../../kernel/diagnostics.js";
import {
  readSubgraphProtocol,
  type SubgraphDescription,
  type SubgraphProtocol,
  type SubgraphProtocolRead,
} from "../../subgraph/protocol.js";
import { subgraphToolingDiagnostics } from "./diagnostic-codes.js";

/** @experimental The definition a code-first class's `describe()` compiled. */
export type TypedSubgraphDefinition = Extract<
  SubgraphDefinition,
  { readonly schemaKind: "typed" }
>;

/** @experimental A code-first subgraph whose description compiled. */
export type CodeFirstSubgraph = {
  readonly name: string;
  readonly source: DefinitionSource;
  readonly definition: TypedSubgraphDefinition;
};

/** @experimental What {@link readSubgraphDefinitions} found in a module. */
export type SubgraphDefinitions = {
  /** In export order: the module's own order, or name order for an ES module namespace. */
  readonly subgraphs: readonly CodeFirstSubgraph[];
  /** Protocol, describe and name problems, and each description's own diagnostics. */
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

const DEFAULT_SPECIFIER = "./subgraphs/index.ts";

type Candidate = {
  readonly value: (...args: never[]) => unknown;
  readonly exportPath: readonly string[];
};

/** An ES module namespace lists its exports by name; Vite's runner lists them in statement order. */
function entriesByName(
  record: object,
): readonly (readonly [string, unknown])[] {
  const keys = Object.keys(record);
  if (Object.prototype.toString.call(record) === "[object Module]") {
    keys.sort();
  }
  return keys.map((key) => [key, (record as Record<string, unknown>)[key]]);
}

/**
 * Every function a module exports, directly or as a value of an exported
 * object, as the host's subgraph extraction reaches them. A value reached
 * twice keeps its first path.
 */
function candidatesOf(exports: object): readonly Candidate[] {
  const found = new Map<unknown, Candidate>();
  const add = (value: unknown, exportPath: readonly string[]) => {
    if (typeof value !== "function" || found.has(value)) return;
    found.set(value, {
      value: value as Candidate["value"],
      exportPath,
    });
  };
  for (const [key, value] of entriesByName(exports)) {
    add(value, [key]);
    if (value !== null && typeof value === "object") {
      for (const [innerKey, inner] of entriesByName(value)) {
        add(inner, [key, innerKey]);
      }
    }
  }
  return [...found.values()];
}

function extendsClass(derived: unknown, base: unknown): boolean {
  for (
    let current: unknown = Object.getPrototypeOf(derived);
    current !== null && current !== undefined;
    current = Object.getPrototypeOf(current)
  ) {
    if (current === base) return true;
  }
  return false;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** A description from another copy of document-model, checked before use. */
function isDescription(value: unknown): value is SubgraphDescription {
  if (value === null || typeof value !== "object") return false;
  const description = value as Record<string, unknown>;
  return (
    Array.isArray(description.diagnostics) &&
    (description.name === undefined || typeof description.name === "string") &&
    (description.definition === undefined ||
      (description.definition !== null &&
        typeof description.definition === "object"))
  );
}

type Described =
  | { readonly kind: "described"; readonly description: SubgraphDescription }
  | { readonly kind: "failed"; readonly diagnostic: DefinitionDiagnostic };

function describeFailed(
  source: DefinitionSource,
  received: string,
  message: string,
): DefinitionDiagnostic {
  return subgraphToolingDiagnostics.create({
    code: "PH-SG-DESCRIBE-FAILED",
    source,
    path: [],
    message,
    expected: "a description with diagnostics, and a name and definition",
    received,
    repair:
      "Keep the subgraph's static members free of side effects: describe() compiles getSchema() and must not throw.",
  });
}

function describe(
  protocol: SubgraphProtocol,
  source: DefinitionSource,
  label: string,
): Described {
  let description: unknown;
  try {
    description = protocol.describe();
  } catch (error) {
    return {
      kind: "failed",
      diagnostic: describeFailed(
        source,
        "a thrown error",
        `describe() of ${label} threw: ${errorMessage(error)}`,
      ),
    };
  }
  if (!isDescription(description)) {
    return {
      kind: "failed",
      diagnostic: describeFailed(
        source,
        describeReceived(description),
        `describe() of ${label} returned no subgraph description.`,
      ),
    };
  }
  return { kind: "described", description };
}

/**
 * @experimental Reads the code-first subgraph classes a module exports, as
 * the host's extraction reaches them: each export, and each value of an
 * exported object. It calls each class's protocol `describe()` and never
 * constructs a class, so a constructor that needs a database or environment
 * does not run. Schema-first classes and other values are left out. A
 * code-first class without a name is a base: it is skipped when another
 * export extends it, and reported when none does.
 */
export function readSubgraphDefinitions(
  exports: object,
  options: { readonly specifier?: `./${string}` } = {},
): SubgraphDefinitions {
  const specifier = options.specifier ?? DEFAULT_SPECIFIER;
  const codeFirst: (Candidate & { readonly protocol: SubgraphProtocol })[] = [];
  const diagnostics: DefinitionDiagnostic[] = [];
  for (const candidate of candidatesOf(exports)) {
    const source = { specifier, exportPath: candidate.exportPath };
    const label = candidate.exportPath.join(".");
    let read: SubgraphProtocolRead;
    try {
      read = readSubgraphProtocol(candidate.value);
    } catch (error) {
      diagnostics.push(
        describeFailed(
          source,
          "a thrown error",
          `Reading the subgraph protocol of ${label} threw: ${errorMessage(error)}`,
        ),
      );
      continue;
    }
    if (read.kind === "code-first") {
      codeFirst.push({ ...candidate, protocol: read.protocol });
    } else if (read.kind === "unsupported") {
      diagnostics.push(
        subgraphToolingDiagnostics.create({
          code: "PH-SG-PROTOCOL-UNSUPPORTED",
          source,
          path: [],
          message: `${label} carries subgraph protocol version ${String(read.version)}, and this release reads version 1.`,
          expected: "protocol version 1",
          received: String(read.version),
          repair:
            "Build the package against the @powerhousedao/reactor-api release this ph-cli belongs to, or update ph-cli.",
        }),
      );
    }
  }
  const subgraphs: CodeFirstSubgraph[] = [];
  for (const candidate of codeFirst) {
    const source = { specifier, exportPath: candidate.exportPath };
    const label = candidate.exportPath.join(".");
    const described = describe(candidate.protocol, source, label);
    if (described.kind === "failed") {
      diagnostics.push(described.diagnostic);
      continue;
    }
    const { name, definition } = described.description;
    if (name === undefined) {
      if (codeFirst.some(({ value }) => extendsClass(value, candidate.value))) {
        continue;
      }
      diagnostics.push(
        subgraphToolingDiagnostics.create({
          code: "PH-SG-NAME-MISSING",
          source,
          path: [],
          message: `${label} has no static subgraphName, and no other export extends it.`,
          expected: "a static subgraphName, or a subclass that declares one",
          received: "no subgraphName",
          repair:
            "Declare static readonly subgraphName on the class, or export only the subclasses that extend it.",
        }),
      );
      continue;
    }
    for (const diagnostic of described.description.diagnostics) {
      diagnostics.push(
        diagnostic.source === undefined
          ? { ...diagnostic, source }
          : diagnostic,
      );
    }
    if (definition?.schemaKind === "typed") {
      subgraphs.push({ name, source, definition });
    }
  }
  return { subgraphs, diagnostics };
}
