import type { NormalizedDocumentModelArtifact } from "../../adapters/types.js";
import { logicalCollisionDiagnostics } from "../../report/logical-collisions.js";
import type { DefinitionCheck } from "../types.js";

export const logicalCollisionsCheck: DefinitionCheck = {
  name: "logical-collisions",
  run: ({ sourceSet, artifacts }) => {
    const groups = new Map<string, NormalizedDocumentModelArtifact[]>();
    for (const artifact of artifacts) {
      const key = `${artifact.documentType}@${artifact.version}`;
      groups.set(key, [...(groups.get(key) ?? []), artifact]);
    }
    return [...groups.values()].flatMap((group) =>
      logicalCollisionDiagnostics(sourceSet, group),
    );
  },
};
