import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionSource,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import { canonicalDigest } from "../../../kernel/primitives.js";
import { checkDiagnostics } from "../diagnostic-codes.js";
import { servedSpecification } from "../../report/served-specification.js";
import type { DefinitionCheck } from "../types.js";

type Use = {
  readonly digest: Sha256Digest;
  readonly source: DefinitionSource;
  readonly path: DefinitionPath;
};

/**
 * A host serves every model of a package and declares each scalar once, so
 * two package scalars that share a name but not a definition collide there.
 * The compiler sees one model at a time and cannot catch this.
 */
export const packageScalarNamesCheck: DefinitionCheck = {
  name: "package-scalar-names",
  run: ({ artifacts }) => {
    const first = new Map<string, Use>();
    const diagnostics: DefinitionDiagnostic[] = [];
    for (const artifact of artifacts) {
      const served = servedSpecification(artifact);
      if (served === undefined) continue;
      served.specification.scalars.forEach((scalar, scalarIndex) => {
        if (!("definition" in scalar)) return;
        const use = {
          digest: canonicalDigest(scalar.definition),
          source: artifact.source,
          path: ["specifications", served.index, "scalars", scalarIndex],
        };
        const known = first.get(scalar.name);
        if (known === undefined) {
          first.set(scalar.name, use);
          return;
        }
        if (known.digest === use.digest) return;
        diagnostics.push(
          checkDiagnostics.create({
            code: "PH-PKG-SCALAR-CONFLICT",
            source: use.source,
            definition: { kind: "scalar", key: scalar.name },
            path: use.path,
            message: `Two different package scalars are named ${scalar.name}.`,
            expected: "one definition per package scalar name",
            received: scalar.name,
            repair: `Declare ${scalar.name} once with defineScalar in scalars/index.ts and import it everywhere it is used.`,
            related: [
              {
                source: known.source,
                path: known.path,
                message: `The other ${scalar.name} is used here.`,
              },
            ],
          }),
        );
      });
    }
    return diagnostics;
  },
};
