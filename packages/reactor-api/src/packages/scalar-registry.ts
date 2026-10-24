import {
  getCatalogScalar,
  SCALAR_DEFINITION_VERSION,
  type ScalarDefinition,
} from "document-model/scalars";
import { specifiedScalarTypes } from "graphql";
import { reservedTypeNames } from "../utils/create-schema.js";
import type {
  RegisteredScalar,
  ScalarRegistry,
} from "../utils/scalar-types.js";
import type { ScalarExport } from "./scalar-exports.js";

export type ScalarRefusal =
  | {
      readonly kind: "reserved-name";
      readonly packageName: string;
      readonly exportName: string;
      readonly name: string;
      readonly reservedBy:
        | "GraphQL built-in"
        | "catalog"
        | "document-model schema";
    }
  | {
      readonly kind: "duplicate-name";
      readonly packageName: string;
      readonly name: string;
      readonly registeredBy: string;
    }
  | {
      readonly kind: "export-key-mismatch";
      readonly packageName: string;
      readonly exportName: string;
      readonly name: string;
    }
  | {
      readonly kind: "unsupported-version";
      readonly packageName: string;
      readonly exportName: string;
      readonly version: unknown;
    };

function reservedBy(
  name: string,
): Extract<ScalarRefusal, { kind: "reserved-name" }>["reservedBy"] | undefined {
  if (specifiedScalarTypes.some((type) => type.name === name)) {
    return "GraphQL built-in";
  }
  if (getCatalogScalar(name)) {
    return "catalog";
  }
  return reservedTypeNames([]).has(name) ? "document-model schema" : undefined;
}

export function buildScalarRegistry(
  packages: ReadonlyMap<string, readonly ScalarExport[]>,
): { registry: ScalarRegistry; refusals: readonly ScalarRefusal[] } {
  const registry = new Map<string, RegisteredScalar>();
  const refusals: ScalarRefusal[] = [];
  for (const [packageName, exports] of packages) {
    for (const entry of exports) {
      if (!("definition" in entry)) {
        refusals.push({
          kind: "unsupported-version",
          packageName,
          exportName: entry.exportName,
          version: entry.unsupportedVersion,
        });
        continue;
      }
      const { exportName, definition } = entry;
      const { name } = definition;
      if (exportName !== name) {
        refusals.push({
          kind: "export-key-mismatch",
          packageName,
          exportName,
          name,
        });
        continue;
      }
      const reserved = reservedBy(name);
      if (reserved) {
        refusals.push({
          kind: "reserved-name",
          packageName,
          exportName,
          name,
          reservedBy: reserved,
        });
        continue;
      }
      const holder = registry.get(name);
      if (holder?.definition === definition) continue;
      if (holder) {
        refusals.push({
          kind: "duplicate-name",
          packageName,
          name,
          registeredBy: holder.packageName,
        });
        continue;
      }
      registry.set(name, { definition, packageName });
    }
  }
  return { registry, refusals };
}

const RESERVER = {
  "GraphQL built-in": "GraphQL as a built-in scalar",
  catalog: "the scalar catalog",
  "document-model schema": "the document-model schema",
} as const;

export function describeScalarRefusal(refusal: ScalarRefusal): string {
  switch (refusal.kind) {
    case "reserved-name":
      return `Export ${refusal.exportName} of package ${refusal.packageName} is refused: the name ${refusal.name} is reserved by ${RESERVER[refusal.reservedBy]}.`;
    case "duplicate-name":
      return `Scalar ${refusal.name} of package ${refusal.packageName} is refused: package ${refusal.registeredBy} already registers a different ${refusal.name}.`;
    case "export-key-mismatch":
      return `Scalar ${refusal.name} of package ${refusal.packageName} is refused: it is exported as ${refusal.exportName}, and the export name must equal the scalar name.`;
    case "unsupported-version":
      return `Export ${refusal.exportName} of package ${refusal.packageName} is refused: its scalar definition format version ${String(refusal.version)} is not supported; this host supports version ${SCALAR_DEFINITION_VERSION}.`;
  }
}
