import { canonicalJson } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { storedScalarDefinition } from "document-model/scalars";
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
      readonly kind: "mismatch";
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
        const declared = canonicalJson(definition);
        const registered = canonicalJson(
          storedScalarDefinition(binding.definition),
        );
        return declared === registered
          ? []
          : [
              {
                kind: "mismatch",
                documentType,
                scalar: name,
                packageName: binding.packageName,
                declared,
                registered,
              },
            ];
      },
    );
  });
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
