import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { checkDiagnostics } from "../diagnostic-codes.js";
import {
  documentModelRef,
  servedSpecification,
} from "../../report/served-specification.js";
import type { DefinitionCheck } from "../types.js";

export const initialAuthCheck: DefinitionCheck = {
  name: "initial-authorization",
  run({ artifacts }) {
    const diagnostics: DefinitionDiagnostic[] = [];
    for (const artifact of artifacts) {
      const served = servedSpecification(artifact);
      if (!served) continue;
      const template = served.specification.initialAuth;
      if (!template) continue;
      template.grants.forEach((grant, index) => {
        const group =
          "group" in grant.principal ||
          ("binding" in grant.principal &&
            template.bindings[grant.principal.binding]?.kind === "group");
        if (grant.effect !== "deny" || !group) return;
        diagnostics.push(
          checkDiagnostics.create({
            code: "PH-AUTH-GROUP-DENY",
            source: artifact.source,
            definition: documentModelRef(artifact),
            path: [
              "specifications",
              served.index,
              "initialAuth",
              "grants",
              index,
            ],
            message:
              "A missing group skips this deny and can expose an earlier allow.",
            repair:
              "Prefer a positive group allow-list and test unavailable group dependencies.",
          }),
        );
      });
    }
    return diagnostics;
  },
};
