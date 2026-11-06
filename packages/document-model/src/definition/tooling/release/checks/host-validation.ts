import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionRelatedLocation,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import type { NormalizedDocumentModelArtifact } from "../../adapters/types.js";
import type { DefinitionCheck } from "../../check/types.js";
import {
  documentModelRef,
  servedSpecification,
} from "../../report/served-specification.js";
import { releaseDiagnostics } from "../diagnostic-codes.js";
import type { HostValidationFindingData, ReleaseCheckInput } from "../types.js";

type Site = {
  readonly artifact: NormalizedDocumentModelArtifact;
  readonly path: DefinitionPath;
};

/**
 * Where an author edits what a finding names. A host finding names a document
 * type, not a version, so it points at every artifact of that type; a scalar
 * finding narrows that to the served specifications that declare the scalar.
 */
function findingSites(
  artifacts: readonly NormalizedDocumentModelArtifact[],
  finding: HostValidationFindingData,
): readonly Site[] {
  const ofType = artifacts.filter(
    ({ documentType }) => documentType === finding.documentType,
  );
  if ("scalar" in finding) {
    const declaring = ofType.flatMap((artifact): Site[] => {
      const served = servedSpecification(artifact);
      const index =
        served?.specification.scalars.findIndex(
          ({ name }) => name === finding.scalar,
        ) ?? -1;
      return served === undefined || index === -1
        ? []
        : [
            {
              artifact,
              path: ["specifications", served.index, "scalars", index],
            },
          ];
    });
    if (declaring.length > 0) return declaring;
  }
  return ofType.map((artifact) => ({ artifact, path: [] }));
}

/** The first site carries the diagnostic; the others are related locations. */
function attribution(
  sites: readonly Site[],
  finding: HostValidationFindingData,
  alsoHere: string,
): {
  readonly source?: DefinitionSource;
  readonly path: DefinitionPath;
  readonly related: readonly DefinitionRelatedLocation[];
} {
  if (sites.length === 0) return { path: [], related: [] };
  const [first, ...others] = sites;
  return {
    source: first.artifact.source,
    path: first.path,
    related: others.map(({ artifact, path }) => ({
      source: artifact.source,
      path,
      message: alsoHere,
    })),
  };
}

function hostFindingDiagnostic(
  artifacts: readonly NormalizedDocumentModelArtifact[],
  finding: HostValidationFindingData,
): DefinitionDiagnostic {
  const { documentType } = finding;
  const sites = findingSites(artifacts, finding);
  switch (finding.kind) {
    case "scalar-unbound": {
      const { source, path, related } = attribution(
        sites,
        finding,
        `This version also declares ${finding.scalar}.`,
      );
      return releaseDiagnostics.create({
        code: "PH-REL-HOST-SCALAR-UNBOUND",
        ...(source !== undefined && { source }),
        definition: { kind: "scalar", key: finding.scalar },
        path,
        message: `${documentType} declares package scalar ${finding.scalar}, but the package registers no binding for it, so a host serves ${finding.scalar} values without validating them.`,
        expected: `an export named ${finding.scalar} in the package's scalars entry`,
        received: "no binding",
        repair: `Export the defineScalar binding the model uses from scalars/index.ts under the name ${finding.scalar}.`,
        ...(related.length > 0 && { related }),
      });
    }
    case "scalar-mismatch": {
      const { source, path, related } = attribution(
        sites,
        finding,
        `This version also declares ${finding.scalar}.`,
      );
      return releaseDiagnostics.create({
        code: "PH-REL-HOST-SCALAR-MISMATCH",
        ...(source !== undefined && { source }),
        definition: { kind: "scalar", key: finding.scalar },
        path,
        message: `${documentType} declares package scalar ${finding.scalar} differently from the binding package ${finding.packageName} registers, and a host serves the registered binding.`,
        expected: finding.declared,
        received: finding.registered,
        repair: `Use the ${finding.scalar} binding that scalars/index.ts exports in the model, so the model and the package declare one ${finding.scalar}.`,
        ...(related.length > 0 && { related }),
      });
    }
    case "scalar-uncomparable": {
      const { source, path, related } = attribution(
        sites,
        finding,
        `This version also declares ${finding.scalar}.`,
      );
      return releaseDiagnostics.create({
        code: "PH-REL-HOST-SCALAR-UNCOMPARABLE",
        ...(source !== undefined && { source }),
        definition: { kind: "scalar", key: finding.scalar },
        path,
        message: `${documentType} declares package scalar ${finding.scalar} with a validator that differs from the one package ${finding.packageName} registers in checks JSON Schema cannot express (refinements, transforms, custom checks), so the validators could not be compared, and a host serves the registered binding.`,
        expected: finding.declared,
        received: finding.registered,
        repair: `Use the ${finding.scalar} binding that scalars/index.ts exports in the model, so the model and the package declare one ${finding.scalar}.`,
        ...(related.length > 0 && { related }),
      });
    }
    case "definition-invalid":
    case "definition-mismatch": {
      const { source, path, related } = attribution(
        sites,
        finding,
        `This version of ${documentType} carries the same definition.`,
      );
      const invalid = finding.kind === "definition-invalid";
      const repairs = [...new Set(finding.diagnostics.map((d) => d.repair))];
      return releaseDiagnostics.create({
        code: invalid
          ? "PH-REL-HOST-DEFINITION-INVALID"
          : "PH-REL-HOST-DEFINITION-MISMATCH",
        ...(source !== undefined && { source }),
        definition:
          sites.length === 0
            ? { kind: "document-model", key: documentType }
            : documentModelRef(sites[0].artifact),
        path,
        message: invalid
          ? `A host serves ${documentType} from its stored SDL, because the module's definition fails the wire shape.`
          : `A host serves ${documentType} from its stored SDL, because the module's definition declares another document type or version.`,
        repair:
          repairs.length > 0
            ? repairs.join(" ")
            : "Materialize the module and its definition from the same declaration, and export the module materialize returned.",
        related: [
          ...related,
          ...finding.diagnostics.map(({ code, path, message }) => ({
            path,
            message: `${code}: ${message}`,
          })),
        ],
      });
    }
  }
}

/**
 * Maps the host's verdict on the package's models to diagnostics, so a
 * release check fails on what a host would refuse or serve differently.
 */
export const hostValidationCheck: DefinitionCheck<ReleaseCheckInput> = {
  name: "host-validation",
  run: ({ artifacts, release: { host } }) => [
    ...(host.completed
      ? []
      : [
          releaseDiagnostics.create({
            code: "PH-REL-HOST-VALIDATION-INCOMPLETE",
            path: [],
            message:
              "Host validation did not run, so this check cannot tell whether a host serves the package's models as declared.",
            received: host.reason,
            repair:
              "Fix what stopped host validation, then run the release check again.",
          }),
        ]),
    ...host.findings.map((finding) =>
      hostFindingDiagnostic(artifacts, finding),
    ),
  ],
};
