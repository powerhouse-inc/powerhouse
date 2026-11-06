import {
  canonicalJson,
  type StoredScalarDefinition,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import {
  modelPackageScalars,
  type ScalarDefinition,
  storedScalarDefinition,
} from "document-model/scalars";
import { z } from "zod";
import type { ScalarRegistry } from "../../utils/scalar-types.js";
import {
  documentModelSchemaSource,
  type DocumentModelSource,
} from "./source.js";

export type PackageScalarFinding =
  | {
      readonly kind: "unbound";
      readonly documentType: string;
      readonly scalar: string;
    }
  | {
      readonly kind: "mismatch" | "uncomparable";
      readonly documentType: string;
      readonly scalar: string;
      readonly packageName: string;
      readonly declared: string;
      readonly registered: string;
    };

export function packageScalarFindings(
  models: readonly DocumentModelSource[],
  registry: ScalarRegistry,
): PackageScalarFinding[] {
  return models.flatMap((model) => {
    const documentType = model.documentModel.global.id;
    return documentModelSchemaSource(model).packageScalars.flatMap(
      ({ name, definition }): PackageScalarFinding[] => {
        const binding = registry.get(name);
        if (binding === undefined) {
          return [{ kind: "unbound", documentType, scalar: name }];
        }
        const difference = scalarDifference(
          definition,
          modelPackageScalars(model).get(name),
          binding.definition,
        );
        return difference === undefined
          ? []
          : [
              {
                ...difference,
                documentType,
                scalar: name,
                packageName: binding.packageName,
              },
            ];
      },
    );
  });
}

type ScalarDifference = {
  readonly kind: "mismatch" | "uncomparable";
  readonly declared: string;
  readonly registered: string;
};

function validatorSource(definition: ScalarDefinition): unknown {
  const ancestors: object[] = [];
  const walk = (value: unknown): unknown => {
    if (typeof value === "function") return { function: String(value) };
    if (value instanceof RegExp) return { regexp: String(value) };
    if (typeof value === "number" && !Number.isFinite(value)) {
      return { number: String(value) };
    }
    if (typeof value === "bigint" || typeof value === "symbol") {
      return { [typeof value]: String(value) };
    }
    if (typeof value !== "object" || value === null) return value;
    const zodDef = zodDefinition(value);
    const node = zodDef ?? value;
    const depth = ancestors.lastIndexOf(node);
    if (depth !== -1) return { cycle: ancestors.length - depth };
    ancestors.push(node);
    const tree = Array.isArray(node)
      ? node.map(walk)
      : Object.fromEntries(
          Object.entries(node)
            .filter(
              ([key, entry]) =>
                entry !== undefined &&
                !(zodDef !== undefined && key === "error"),
            )
            .map(([key, entry]) => [key, walk(entry)]),
        );
    ancestors.pop();
    return tree;
  };
  return walk(definition.schema);
}

function zodDefinition(value: object): object | undefined {
  const internals = (value as { _zod?: { def?: unknown } })._zod;
  return typeof internals?.def === "object" && internals.def !== null
    ? internals.def
    : undefined;
}

function jsonSchemaOf(definition: ScalarDefinition): unknown {
  try {
    return z.toJSONSchema(definition.schema);
  } catch {
    return undefined;
  }
}

function scalarDifference(
  declared: StoredScalarDefinition,
  compiledWith: ScalarDefinition | undefined,
  registered: ScalarDefinition,
): ScalarDifference | undefined {
  const registeredMetadata = storedScalarDefinition(registered);
  const metadata = {
    declared: canonicalJson(declared),
    registered: canonicalJson(registeredMetadata),
  };
  if (metadata.declared !== metadata.registered) {
    return { kind: "mismatch", ...metadata };
  }
  if (compiledWith === undefined || compiledWith === registered) {
    return undefined;
  }
  const own = validatorSource(compiledWith);
  const bound = validatorSource(registered);
  if (canonicalJson(own) === canonicalJson(bound)) return undefined;
  const ownJsonSchema = jsonSchemaOf(compiledWith);
  const boundJsonSchema = jsonSchemaOf(registered);
  const differ =
    ownJsonSchema !== undefined &&
    boundJsonSchema !== undefined &&
    canonicalJson(ownJsonSchema) !== canonicalJson(boundJsonSchema);
  return {
    kind: differ ? "mismatch" : "uncomparable",
    declared: canonicalJson({
      ...declared,
      validator: differ ? { jsonSchema: ownJsonSchema } : { zod: own },
    }),
    registered: canonicalJson({
      ...registeredMetadata,
      validator: differ ? { jsonSchema: boundJsonSchema } : { zod: bound },
    }),
  };
}

export class PackageScalarBindingLog {
  readonly #logged = new Set<string>();

  report(
    models: readonly DocumentModelSource[],
    registry: ScalarRegistry,
    logger: ILogger,
  ): void {
    for (const finding of packageScalarFindings(models, registry)) {
      const key = JSON.stringify(finding);
      if (this.#logged.has(key)) continue;
      this.#logged.add(key);
      if (finding.kind === "unbound") {
        logger.warn(
          "Document model @documentType declares package scalar @scalar, which no package registers; it is served without validation.",
          finding.documentType,
          finding.scalar,
        );
      } else if (finding.kind === "uncomparable") {
        logger.warn(
          "Document model @documentType declares package scalar @scalar as @declared, and package @package registers @registered; their validators differ in checks JSON Schema cannot express, so they could not be compared. The registered binding is served.",
          finding.documentType,
          finding.scalar,
          finding.declared,
          finding.packageName,
          finding.registered,
        );
      } else {
        logger.warn(
          "Document model @documentType declares package scalar @scalar as @declared, but package @package registers @registered; the registered binding is served.",
          finding.documentType,
          finding.scalar,
          finding.declared,
          finding.packageName,
          finding.registered,
        );
      }
    }
  }
}
