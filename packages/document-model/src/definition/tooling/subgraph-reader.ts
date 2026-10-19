import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createDiagnostic } from "../diagnostics.js";
import { compareCodeUnits } from "../primitives.js";
import { namelessSubgraphMessage } from "../subgraph/definer.js";
import type {
  DescribedSubgraph,
  LoadedSubgraphSet,
  SubgraphClass,
  SubgraphProtocolDescription,
} from "./definition-source-types.js";
import {
  describeThrown,
  structuredDiagnostics,
} from "./structured-diagnostics.js";
import { legacyFieldsDeclaredBy } from "./subgraph-legacy-fields.js";

const SUBGRAPH_PROTOCOL = Symbol.for("powerhouse.subgraph");

const SUBGRAPH_PROTOCOL_VERSION = 1;

const SUBGRAPHS_DIRECTORY = "subgraphs";

/**
 * The package's subgraph entries: `subgraphs/index.ts`, then each
 * `subgraphs/<name>/index.ts`. They are the build entries the host's
 * `subgraphs` export is made from, so tooling finds what a host would load.
 */
export function subgraphEntrySpecifiers(
  packageRoot: string,
): readonly `./${string}`[] {
  const root = join(packageRoot, SUBGRAPHS_DIRECTORY);
  const specifiers: `./${string}`[] = [];
  if (existsSync(join(root, "index.ts"))) {
    specifiers.push(`./${SUBGRAPHS_DIRECTORY}/index.ts`);
  }
  let directories: string[];
  try {
    directories = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort(compareCodeUnits);
  } catch {
    directories = [];
  }
  for (const name of directories) {
    if (existsSync(join(root, name, "index.ts"))) {
      specifiers.push(`./${SUBGRAPHS_DIRECTORY}/${name}/index.ts`);
    }
  }
  return specifiers;
}

/**
 * Whether `candidate` is a subgraph class, by the host's rule: it speaks the
 * subgraph protocol, or its prototype chain reaches a class named
 * `BaseSubgraph` from an older reactor-api. The framework base itself, from
 * any copy of reactor-api, is not one.
 */
export function isSubgraphClass(
  candidate: unknown,
): candidate is SubgraphClass {
  if (typeof candidate !== "function") return false;
  const authored = readUnlessItThrows(() => isAuthoredProtocolClass(candidate));
  if (!authored.ok) return false;
  if (authored.value) return true;
  let proto = readUnlessItThrows((): unknown =>
    Object.getPrototypeOf(candidate),
  );
  while (proto.ok && typeof proto.value === "function") {
    const parent = proto.value;
    const parentName = readUnlessItThrows(() => parent.name);
    if (!parentName.ok) return false;
    if (parentName.value === "BaseSubgraph") return true;
    proto = readUnlessItThrows((): unknown => Object.getPrototypeOf(parent));
  }
  return false;
}

function isAuthoredProtocolClass(candidate: object): boolean {
  if (typeof protocolMethodOf(candidate) !== "function") return false;
  const isFrameworkBase =
    Object.hasOwn(candidate, SUBGRAPH_PROTOCOL) &&
    !Object.hasOwn(candidate, "subgraphName");
  return !isFrameworkBase;
}

function readUnlessItThrows<T>(
  read: () => T,
): { readonly ok: true; readonly value: T } | { readonly ok: false } {
  try {
    return { ok: true, value: read() };
  } catch {
    return { ok: false };
  }
}

function protocolMethodOf(subgraphClass: object): unknown {
  return (subgraphClass as Record<symbol, unknown>)[SUBGRAPH_PROTOCOL];
}

export type SubgraphEntryNamespace = {
  readonly specifier: `./${string}`;
  readonly namespace: Readonly<Record<string, unknown>>;
};

type Found = {
  readonly subgraphClass: SubgraphClass;
  readonly source: DefinitionSource;
  readonly path: DefinitionPath;
};

/**
 * Every class `isClass` accepts that `root` exports, the way a host loading
 * the package finds them: an exported class, or a class among the values of
 * an exported container at any depth (a module namespace, an array or a plain
 * object), or among the own values of any other object `root` exports, such as
 * a class instance. Each class is returned once, with the export path it is first
 * reached by, and each container is walked once, so a cycle ends. A module
 * namespace is walked in export-name order, as native ESM lists it under
 * every loader; arrays and plain objects keep their own order.
 */
export function subgraphClassesIn<T>(
  root: object,
  isClass: (value: unknown) => value is T,
): { readonly value: T; readonly path: readonly string[] }[] {
  const found = new Map<T, readonly string[]>();
  const visited = new Set<object>();
  const collect = (container: object, path: readonly string[]) => {
    if (visited.has(container)) return;
    visited.add(container);
    for (const [key, value] of entriesByName(container)) {
      if (isClass(value)) {
        if (!found.has(value)) found.set(value, [...path, key]);
      } else if (isContainer(value, path.length === 0)) {
        collect(value, [...path, key]);
      }
    }
  };
  collect(root, []);
  return Array.from(found, ([value, path]) => ({ value, path }));
}

function isContainer(value: unknown, exported: boolean): value is object {
  if (typeof value !== "object" || value === null) return false;
  if (exported || Array.isArray(value) || isModuleNamespace(value)) return true;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isModuleNamespace(value: object): boolean {
  return Object.prototype.toString.call(value) === "[object Module]";
}

function entriesByName(container: object): (readonly [string, unknown])[] {
  const keys = Object.keys(container);
  if (isModuleNamespace(container)) keys.sort(compareCodeUnits);
  return keys.map((key) => [key, (container as Record<string, unknown>)[key]]);
}

/**
 * Reads every subgraph class the entries export, found as the host finds
 * them (see {@link subgraphClassesIn}), each class once across the entries.
 *
 * Classes are classified after the whole set is collected. A class with its
 * own static `subgraphName` is read through the subgraph protocol's
 * `describe()`, unless it or an ancestor declares an old-style instance field,
 * which the host refuses. A nameless class that an exported named class
 * extends is returned as a shared base. Any other class is old-style or
 * nameless, and is refused with the `ph migrate` hint: unlike a running host,
 * tooling never serves one.
 *
 * Reading runs author code: `describe()` walks the prototype chain and calls
 * each class's static `getSchema`, twice, to refuse one whose schema changes.
 * It never constructs a class, calls a hook, or calls a resolver factory.
 * Each class fails on its own, so one broken class does not hide the
 * diagnostics of the others.
 */
export function readSubgraphEntries(
  entries: readonly SubgraphEntryNamespace[],
): LoadedSubgraphSet {
  const found: Found[] = [];
  const sharedBases: LoadedSubgraphSet["sharedBases"][number][] = [];
  const subgraphs: DescribedSubgraph[] = [];
  const diagnostics: DefinitionDiagnostic[] = [];
  for (const { specifier, namespace } of entries) {
    let classes: ReturnType<typeof subgraphClassesIn<SubgraphClass>>;
    try {
      classes = subgraphClassesIn(namespace, isSubgraphClass);
    } catch (error) {
      diagnostics.push(
        createDiagnostic({
          code: "PH-IMPORT-FAILED",
          source: { specifier },
          path: [],
          message: "This subgraph entry's exports could not be read.",
          expected: "a module whose exports can be read",
          received: describeThrown(error),
          repair:
            "Fix this module or one of its imports, then run the definition check again.",
        }),
      );
      continue;
    }
    for (const { value, path } of classes) {
      if (found.some((entry) => entry.subgraphClass === value)) continue;
      found.push({
        subgraphClass: value,
        source: { specifier, exportPath: [...path] },
        path,
      });
    }
  }

  const named = found.filter(({ subgraphClass }) =>
    Object.hasOwn(subgraphClass, "subgraphName"),
  );
  const claimed = new Map<string, Found>();
  for (const entry of found) {
    if (!Object.hasOwn(entry.subgraphClass, "subgraphName")) {
      const isSharedBase = named.some(({ subgraphClass }) =>
        Object.prototype.isPrototypeOf.call(entry.subgraphClass, subgraphClass),
      );
      if (isSharedBase) {
        sharedBases.push({
          source: entry.source,
          path: entry.path,
          value: entry.subgraphClass,
        });
      } else {
        diagnostics.push(namelessDiagnostic(entry));
      }
      continue;
    }
    const legacyFields = legacyFieldsDeclaredBy(
      entry.subgraphClass,
      isAuthoredProtocolClass,
    );
    if (legacyFields.length > 0) {
      diagnostics.push(legacyFieldsDiagnostic(entry, legacyFields));
      continue;
    }
    const read = describeEntry(entry);
    if (!read.ok) {
      diagnostics.push(...read.diagnostics);
      continue;
    }
    const { subgraphName } = read.described.description;
    const holder = claimed.get(subgraphName);
    if (holder !== undefined) {
      diagnostics.push(collisionDiagnostic(entry, holder, subgraphName));
      continue;
    }
    claimed.set(subgraphName, entry);
    subgraphs.push(read.described);
    diagnostics.push(...read.described.description.diagnostics);
  }
  return { sharedBases, subgraphs, diagnostics };
}

type DescribeOptions = { readonly checkDeterminism: boolean };

type DescribeResult =
  | { readonly ok: true; readonly described: DescribedSubgraph }
  | {
      readonly ok: false;
      readonly diagnostics: readonly DefinitionDiagnostic[];
    };

function describeEntry(entry: Found): DescribeResult {
  const { subgraphClass, source, path } = entry;
  const name = classNameOf(subgraphClass);
  const failure = (
    message: string,
    repair: string,
    received?: string,
  ): DescribeResult => ({
    ok: false,
    diagnostics: [
      createDiagnostic({
        code: "PH-SG-DEFINITION-INVALID",
        source,
        path,
        message,
        ...(received !== undefined && { received }),
        repair,
      }),
    ],
  });
  try {
    const method = protocolMethodOf(subgraphClass);
    if (typeof method !== "function") {
      return failure(
        `${name} declares a static subgraphName but has no subgraph protocol.`,
        "Extend BaseSubgraph from @powerhousedao/reactor-api, and build the package against a release that speaks subgraph protocol version 1.",
      );
    }
    const protocol = (method as () => unknown).call(subgraphClass) as
      | { readonly version?: unknown; readonly describe?: unknown }
      | undefined;
    if (protocol?.version !== SUBGRAPH_PROTOCOL_VERSION) {
      return failure(
        `${name} speaks subgraph protocol version ${String(protocol?.version)}, and this release of ph speaks version ${SUBGRAPH_PROTOCOL_VERSION}.`,
        `Check the package with a ph release that speaks subgraph protocol version ${String(protocol?.version)}, or rebuild it against @powerhousedao/reactor-api for version ${SUBGRAPH_PROTOCOL_VERSION}.`,
        String(protocol?.version),
      );
    }
    if (typeof protocol.describe !== "function") {
      return failure(
        `${name}'s subgraph protocol has no describe().`,
        "Rebuild the package against @powerhousedao/reactor-api.",
      );
    }
    const description = (
      protocol.describe as (options: DescribeOptions) => unknown
    ).call(protocol, { checkDeterminism: true });
    return describedOf(entry, description);
  } catch (error) {
    const structured = structuredDiagnostics(error, source);
    if (structured !== undefined) return { ok: false, diagnostics: structured };
    return failure(
      `${name} could not be described: ${describeThrown(error)}.`,
      `Fix ${name}.getSchema so that it returns its schema without throwing.`,
      describeThrown(error),
    );
  }
}

function describedOf(entry: Found, value: unknown): DescribeResult {
  const record = (
    value !== null && typeof value === "object" ? value : {}
  ) as Partial<Record<keyof SubgraphProtocolDescription, unknown>>;
  if (
    typeof record.subgraphName !== "string" ||
    record.definition === null ||
    typeof record.definition !== "object" ||
    typeof record.hasSubscriptions !== "boolean"
  ) {
    return {
      ok: false,
      diagnostics: [
        createDiagnostic({
          code: "PH-SG-DEFINITION-INVALID",
          source: entry.source,
          path: entry.path,
          message: `${classNameOf(entry.subgraphClass)}'s describe() returned no subgraph description.`,
          repair: "Rebuild the package against @powerhousedao/reactor-api.",
        }),
      ],
    };
  }
  const diagnostics = structuredDiagnostics(record, entry.source);
  if (isUnreadableDiagnosticList(record.diagnostics, diagnostics)) {
    return {
      ok: false,
      diagnostics: [
        createDiagnostic({
          code: "PH-SG-DEFINITION-INVALID",
          source: entry.source,
          path: [...entry.path, "diagnostics"],
          message: `${classNameOf(entry.subgraphClass)}'s compile diagnostics could not be read.`,
          expected: "diagnostics from the V1 catalog",
          received: `${record.diagnostics.length} diagnostics`,
          repair:
            "Check the package with the ph release its @powerhousedao/reactor-api matches.",
        }),
      ],
    };
  }
  return {
    ok: true,
    described: {
      source: entry.source,
      path: entry.path,
      value: entry.subgraphClass,
      description: {
        ...(record as unknown as SubgraphProtocolDescription),
        diagnostics: diagnostics ?? [],
      },
    },
  };
}

function isUnreadableDiagnosticList(
  declared: unknown,
  read: readonly DefinitionDiagnostic[] | undefined,
): declared is readonly unknown[] {
  return read === undefined && Array.isArray(declared) && declared.length > 0;
}

function namelessDiagnostic({
  subgraphClass,
  source,
  path,
}: Found): DefinitionDiagnostic {
  const name = classNameOf(subgraphClass);
  return createDiagnostic({
    code: "PH-SG-DEFINITION-INVALID",
    source,
    path,
    message: namelessSubgraphMessage(name),
    expected: "a class with its own static subgraphName and getSchema",
    received: name,
    repair: `Declare static override readonly subgraphName = "my-subgraph" and static override getSchema(schema) on ${name}. Run ph migrate to convert an old-style subgraph that sets name, typeDefs, resolvers, hasSubscriptions or path.`,
  });
}

function legacyFieldsDiagnostic(
  { subgraphClass, source, path }: Found,
  fields: readonly string[],
): DefinitionDiagnostic {
  const name = classNameOf(subgraphClass);
  const subgraphName = String(
    (subgraphClass as { readonly subgraphName?: unknown }).subgraphName,
  );
  const plural = fields.length > 1;
  return createDiagnostic({
    code: "PH-SG-DEFINITION-INVALID",
    source,
    path,
    message: `${name} declares static subgraphName "${subgraphName}" and the old-style ${plural ? "fields" : "field"} ${fields.join(", ")}, which the host refuses.`,
    expected: "a schema declared in static getSchema only",
    received: fields.join(", "),
    repair: `Remove ${plural ? "them" : "it"} and declare the schema in static getSchema. Run ph migrate to convert an old-style subgraph.`,
  });
}

function collisionDiagnostic(
  entry: Found,
  holder: Found,
  subgraphName: string,
): DefinitionDiagnostic {
  return createDiagnostic({
    code: "PH-PKG-LOGICAL-COLLISION",
    source: entry.source,
    path: entry.path,
    message: `${classNameOf(entry.subgraphClass)} and ${classNameOf(holder.subgraphClass)} both declare subgraph ${subgraphName}, so a host serving this package would keep only one of them.`,
    expected: "one class per subgraphName",
    received: `subgraph ${subgraphName}`,
    repair: "Give each subgraph class its own subgraphName.",
    related: [
      {
        source: holder.source,
        path: holder.path,
        message: "The first class claiming it is here.",
      },
    ],
  });
}

function classNameOf(subgraphClass: SubgraphClass): string {
  try {
    const { name } = subgraphClass;
    return typeof name === "string" && name !== ""
      ? name
      : "An anonymous class";
  } catch {
    return "An anonymous class";
  }
}
