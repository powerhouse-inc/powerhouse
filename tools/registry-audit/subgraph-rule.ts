import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const protocol = Symbol.for("powerhouse.subgraph");
const legacyFields = ["name", "typeDefs", "resolvers"];

type SubgraphConstructor = abstract new (...args: never[]) => unknown;

function isSubgraphConstructor(value: unknown): value is SubgraphConstructor {
  if (typeof value !== "function") return false;
  const prototype: unknown = value.prototype;
  return typeof prototype === "object" && prototype !== null;
}

export type SubgraphFinding = {
  exports: string[];
  className: string;
  classification: "new-style" | "old-style" | "nameless/other";
  evidence: string;
  constructed: boolean;
  constructionRequired: boolean;
};

function descriptor(
  value: object,
  key: PropertyKey,
): PropertyDescriptor | undefined {
  for (
    let current: unknown = value;
    (typeof current === "object" && current !== null) ||
    typeof current === "function";
    current = Object.getPrototypeOf(current)
  ) {
    const found = Object.getOwnPropertyDescriptor(current, key);
    if (found) return found;
  }
  return undefined;
}

function classify(
  value: SubgraphConstructor,
  exports: string[],
): SubgraphFinding {
  const result: SubgraphFinding = {
    exports,
    className: value.name,
    classification: "nameless/other",
    evidence: "No subgraph protocol or legacy shape found",
    constructed: false,
    constructionRequired: false,
  };
  const name = Object.getOwnPropertyDescriptor(value, "subgraphName");
  const marker = descriptor(value, protocol);
  if (typeof name?.value === "string" && typeof marker?.value === "function") {
    return {
      ...result,
      classification: "new-style",
      evidence:
        "Own static subgraphName and static powerhouse.subgraph protocol",
    };
  }
  for (
    let proto: unknown = value.prototype;
    ((typeof proto === "object" && proto !== null) ||
      typeof proto === "function") &&
    proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    const constructor: unknown = Object.getOwnPropertyDescriptor(
      proto,
      "constructor",
    )?.value;
    if (
      typeof marker?.value !== "function" &&
      typeof constructor === "function" &&
      constructor.name === "BaseSubgraph"
    ) {
      return {
        ...result,
        classification: "old-style",
        evidence: "Prototype chain reaches BaseSubgraph without the protocol",
      };
    }
    if (legacyFields.every((field) => descriptor(proto, field))) {
      return {
        ...result,
        classification: "old-style",
        evidence:
          "Prototype declares name/typeDefs/resolvers (accessors not invoked)",
      };
    }
  }
  result.constructionRequired = true;
  try {
    const instance: unknown = Reflect.construct(value, [{}]);
    result.constructed = true;
    if (
      typeof instance === "object" &&
      instance !== null &&
      legacyFields.every((field) => field in instance)
    ) {
      result.classification = "old-style";
      result.evidence =
        "Construction required: instance has name/typeDefs/resolvers";
    } else {
      result.evidence =
        "Construction required: instance lacks the legacy shape";
    }
  } catch (error) {
    result.evidence = `Construction required but failed with empty host arguments: ${error instanceof Error ? error.message : String(error)}. Classification unresolved.`;
  }
  return result;
}

export function auditSubgraphExports(module: unknown): SubgraphFinding[] {
  const candidates = new Map<SubgraphConstructor, string[]>();
  function visit(value: unknown, path: string, ancestors: Set<object>) {
    if (typeof value === "function") {
      if (isSubgraphConstructor(value)) {
        const paths = candidates.get(value) ?? [];
        paths.push(path);
        candidates.set(value, paths);
      }
      return;
    }
    if (typeof value !== "object" || value === null || ancestors.has(value))
      return;
    const next = new Set(ancestors).add(value);
    for (const [key, exported] of Object.entries(value)) {
      visit(exported, path ? `${path}.${key}` : key, next);
    }
  }
  visit(module, "", new Set());
  return [...candidates].map(([value, paths]) => classify(value, paths));
}

export async function loadSubgraphExports(
  packageName: string,
  cwd: string,
): Promise<SubgraphFinding[]> {
  const dir = await mkdtemp(join(cwd, ".subgraph-audit-"));
  try {
    const entry = join(dir, "entry.mjs");
    await writeFile(
      entry,
      `import * as entry from ${JSON.stringify(`${packageName}/subgraphs`)};\nexport default entry;\n`,
    );
    const loaded: unknown = await import(pathToFileURL(entry).href);
    return auditSubgraphExports(
      typeof loaded === "object" && loaded !== null && "default" in loaded
        ? loaded.default
        : undefined,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
