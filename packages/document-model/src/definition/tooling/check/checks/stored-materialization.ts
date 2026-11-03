import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { canonicalJson } from "../../../kernel/primitives.js";
import { checkDiagnostics } from "../diagnostic-codes.js";
import {
  documentModelRef,
  servedSpecification,
} from "../../report/served-specification.js";
import { readStoredModel } from "../stored-specification.js";
import type { DefinitionCheck } from "../types.js";

/**
 * Hosts read the stored model; consumers of the definition read the
 * structure. A module assembled by hand can make the two disagree.
 */
export const storedMaterializationCheck: DefinitionCheck = {
  name: "stored-materialization",
  run: ({ artifacts }) =>
    artifacts.flatMap((artifact): DefinitionDiagnostic[] => {
      const stored = readStoredModel(artifact);
      if (!stored.ok) return [stored.diagnostic];
      const storedVersions = canonicalJson(stored.versions);
      const declaredVersions = canonicalJson(
        artifact.definition.specifications.map(({ version }) => version),
      );
      const at = {
        source: artifact.source,
        definition: documentModelRef(artifact),
      };
      if (storedVersions !== declaredVersions) {
        return [
          checkDiagnostics.create({
            ...at,
            code: "PH-DM-DECLARATION-INVALID",
            path: stored.path,
            message:
              "The stored specification history and the structured definition cover different versions.",
            expected: declaredVersions,
            received: storedVersions,
            repair:
              "Export the module materialize returned; do not assemble the stored model or its definition by hand.",
          }),
        ];
      }
      const served = servedSpecification(artifact);
      if (served === undefined || stored.served === undefined) return [];
      const { path, initialValues } = stored.served;
      return (["global", "local"] as const).flatMap((scope) => {
        const expected =
          served.specification.state[scope].materialized.initialValue;
        const received = initialValues[scope];
        if (received === expected) return [];
        return [
          checkDiagnostics.create({
            ...at,
            code: "PH-DM-INITIAL-VALUE-INVALID",
            path: [...path, "state", scope, "initialValue"],
            message: `The stored ${scope} initial value is not the one the definition materializes.`,
            expected,
            received,
            repair:
              "Export the module materialize returned; a stored initial value is not an independent setting.",
          }),
        ];
      });
    }),
};
