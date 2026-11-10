import type {
  DefinitionDiagnostic,
  DefinitionPath,
} from "@powerhousedao/shared/document-model";
import { projectDocumentModelGraphQL } from "../../compiler/graphql-projection.js";
import { deriveDocumentModelNames } from "../../compiler/naming.js";
import {
  projectSubgraphGraphQL,
  ROOT_TYPES,
} from "../../subgraph/projection.js";
import type { NormalizedDocumentModelArtifact } from "../adapters/types.js";
import type { DefinitionCheck } from "../check/types.js";
import { servedSpecification } from "../report/served-specification.js";
import type { DefinitionCheckInput } from "../report/types.js";
import {
  conflictingClaims,
  isRootFieldClaim,
  subgraphClaims,
} from "./claims.js";
import { subgraphToolingDiagnostics } from "./diagnostic-codes.js";
import type { SubgraphCheckInput } from "./input.js";
import type { CodeFirstSubgraph } from "./read.js";
import { schemaFirstSdlConflicts } from "./schema-first/sdl-conflicts.js";

/** @experimental The input of {@link subgraphChecks}. */
export type SubgraphChecksInput = DefinitionCheckInput & {
  readonly subgraphs: SubgraphCheckInput;
};

type SubgraphCheck = DefinitionCheck<SubgraphChecksInput>;

function claimPath(subgraph: CodeFirstSubgraph, claim: string): DefinitionPath {
  const { definition } = subgraph;
  if (isRootFieldClaim(claim)) {
    const index = definition.entries.findIndex(
      (entry) =>
        (entry.kind === "query" ||
          entry.kind === "mutation" ||
          entry.kind === "subscription") &&
        `${ROOT_TYPES[entry.kind]}.${entry.fieldName}` === claim,
    );
    return index === -1 ? [] : ["entries", index];
  }
  const index = definition.types.findIndex(({ name }) => name === claim);
  return index === -1 ? [] : ["types", index];
}

const descriptionsCheck: SubgraphCheck = {
  name: "subgraph-descriptions",
  run: ({ subgraphs }) => subgraphs.diagnostics,
};

const namesCheck: SubgraphCheck = {
  name: "subgraph-names",
  run: ({ subgraphs }) => {
    const first = new Map<string, CodeFirstSubgraph>();
    const diagnostics: DefinitionDiagnostic[] = [];
    for (const subgraph of subgraphs.codeFirst) {
      const known = first.get(subgraph.name);
      if (known === undefined) {
        first.set(subgraph.name, subgraph);
        continue;
      }
      diagnostics.push(
        subgraphToolingDiagnostics.create({
          code: "PH-SG-DUPLICATE-NAME",
          source: subgraph.source,
          definition: { kind: "subgraph", key: subgraph.name },
          path: ["name"],
          message: `Two code-first subgraphs are named ${subgraph.name}; a host serves only one of them.`,
          expected: "one subgraph per name",
          received: subgraph.name,
          repair: "Give each subgraph class its own subgraphName.",
          related: [
            {
              source: known.source,
              path: ["name"],
              message: `The other subgraph named ${subgraph.name}.`,
            },
          ],
        }),
      );
    }
    return diagnostics;
  },
};

const typeConflictsCheck: SubgraphCheck = {
  name: "subgraph-type-conflicts",
  run: ({ subgraphs }) => {
    const claimed = subgraphs.codeFirst.map((subgraph) => ({
      subgraph,
      claims: subgraphClaims(projectSubgraphGraphQL(subgraph.definition)),
    }));
    const diagnostics: DefinitionDiagnostic[] = [];
    claimed.forEach(({ subgraph, claims }, index) => {
      for (const earlier of claimed.slice(0, index)) {
        for (const claim of conflictingClaims(earlier.claims, claims)) {
          diagnostics.push(
            subgraphToolingDiagnostics.create({
              code: "PH-SG-TYPE-CONFLICT",
              source: subgraph.source,
              definition: { kind: "subgraph", key: subgraph.name },
              path: claimPath(subgraph, claim),
              message: isRootFieldClaim(claim)
                ? `Code-first subgraphs ${earlier.subgraph.name} and ${subgraph.name} both serve root field ${claim}.`
                : `Code-first subgraphs ${earlier.subgraph.name} and ${subgraph.name} define type ${claim} differently.`,
              expected: isRootFieldClaim(claim)
                ? "each root field served by one subgraph"
                : "one definition per type name",
              received: claim,
              repair: isRootFieldClaim(claim)
                ? "Rename the root field in one of the subgraphs."
                : "Share one ph descriptor for the type between both subgraphs, or rename one of them.",
              related: [
                {
                  source: earlier.subgraph.source,
                  path: claimPath(earlier.subgraph, claim),
                  message: `${earlier.subgraph.name} claims ${claim} here.`,
                },
              ],
            }),
          );
        }
      }
    });
    return diagnostics;
  },
};

/**
 * The names a host generates for a model's GraphQL types: the document type
 * under the model's PascalCase name, and each state output type under
 * `<Name>_<Type>`. Mirrors reactor-api's generated schema.
 */
function generatedTypeNames(
  artifact: NormalizedDocumentModelArtifact,
): readonly string[] {
  const served = servedSpecification(artifact);
  if (served === undefined) return [];
  const { model } = artifact.definition;
  // The host names a model's types after its name, not its graphQLName.
  const prefix = deriveDocumentModelNames({
    id: model.documentType,
    name: model.name.replaceAll("/", " "),
  }).graphQLName;
  let projection: ReturnType<typeof projectDocumentModelGraphQL>;
  try {
    projection = projectDocumentModelGraphQL(
      artifact.definition,
      served.specification,
    );
  } catch {
    // A model the compiler cannot project fails its own checks.
    return [prefix];
  }
  const stateTypes = [
    ...projection.global.document.definitions,
    ...(projection.local?.document.definitions ?? []),
  ].flatMap((node) =>
    node.kind === "ObjectTypeDefinition" ||
    node.kind === "InterfaceTypeDefinition" ||
    node.kind === "UnionTypeDefinition" ||
    node.kind === "EnumTypeDefinition"
      ? [`${prefix}_${node.name.value}`]
      : [],
  );
  return [prefix, ...stateTypes];
}

const documentModelTypesCheck: SubgraphCheck = {
  name: "subgraph-document-model-types",
  run: ({ subgraphs, artifacts }) => {
    if (subgraphs.codeFirst.length === 0) return [];
    const owners = new Map<string, NormalizedDocumentModelArtifact>();
    for (const artifact of artifacts) {
      for (const name of generatedTypeNames(artifact)) {
        if (!owners.has(name)) owners.set(name, artifact);
      }
    }
    return subgraphs.codeFirst.flatMap((subgraph) =>
      subgraph.definition.types.flatMap((type, index) => {
        const owner = owners.get(type.name);
        if (owner === undefined) return [];
        return [
          subgraphToolingDiagnostics.create({
            code: "PH-SG-DOCUMENT-MODEL-TYPE-CONFLICT",
            source: subgraph.source,
            definition: { kind: "subgraph", key: subgraph.name },
            path: ["types", index],
            message: `Code-first subgraph ${subgraph.name} declares type ${type.name}, which document model ${owner.documentType} generates; a host refuses the subgraph.`,
            expected: "a type name no document model of the package generates",
            received: type.name,
            repair: `Rename the subgraph's ${type.name}.`,
            related: [
              {
                source: owner.source,
                path: [],
                message: `${owner.documentType} generates ${type.name}.`,
              },
            ],
          }),
        ];
      }),
    );
  },
};

const packageScalarsCheck: SubgraphCheck = {
  name: "subgraph-package-scalars",
  run: ({ subgraphs }) => {
    const exported = subgraphs.packageScalars;
    if (exported === undefined) return [];
    return subgraphs.codeFirst.flatMap((subgraph) =>
      subgraph.definition.scalars.flatMap((scalar, index) =>
        scalar.implementation.startsWith("package#") &&
        !exported.includes(scalar.name)
          ? [
              subgraphToolingDiagnostics.create({
                code: "PH-SG-SCALAR-UNREGISTERED",
                source: subgraph.source,
                definition: { kind: "subgraph", key: subgraph.name },
                path: ["scalars", index],
                message: `Code-first subgraph ${subgraph.name} uses package scalar ${scalar.name}, which scalars/index.ts does not export; a host cannot register it.`,
                expected:
                  exported.length === 0
                    ? "a scalars/index.ts export of the scalar"
                    : exported.join(", "),
                received: scalar.name,
                repair: `Export ${scalar.name} from scalars/index.ts under its own name: export const ${scalar.name} = defineScalar({ name: "${scalar.name}", ... }).`,
              }),
            ]
          : [],
      ),
    );
  },
};

const NAME_HOLDER = {
  core: "a built-in subgraph",
  "document model": "a document model's subgraph",
} as const;

const hostAdmissionCheck: SubgraphCheck = {
  name: "subgraph-host-admission",
  run: ({ subgraphs, artifacts }) => {
    if (subgraphs.hostConflicts.length === 0) return [];
    // PH-SG-DOCUMENT-MODEL-TYPE-CONFLICT already names these.
    const generated = new Set(artifacts.flatMap(generatedTypeNames));
    return subgraphs.codeFirst.flatMap((subgraph) => {
      const conflict = subgraphs.hostConflicts.find(
        (candidate) => candidate.subgraph === subgraph.name,
      );
      if (conflict === undefined) return [];
      const definition = { kind: "subgraph", key: subgraph.name } as const;
      return [
        ...(conflict.nameHeldBy === undefined
          ? []
          : [
              subgraphToolingDiagnostics.create({
                code: "PH-SG-NAME-RESERVED",
                source: subgraph.source,
                definition,
                path: [],
                message: `Code-first subgraph ${subgraph.name} has the name of ${NAME_HOLDER[conflict.nameHeldBy]}; a host refuses the subgraph.`,
                expected:
                  "a subgraph name no built-in or document-model subgraph uses",
                received: subgraph.name,
                repair: `Rename the subgraph's static subgraphName, for example to "${subgraph.name}-api".`,
              }),
            ]),
        ...conflict.claims
          .filter(({ claim }) => !generated.has(claim))
          .map(({ claim, owner }) =>
            subgraphToolingDiagnostics.create({
              code: "PH-SG-HOST-TYPE-CONFLICT",
              source: subgraph.source,
              definition,
              path: claimPath(subgraph, claim),
              message: `Code-first subgraph ${subgraph.name} declares ${claim}, which the host's ${owner} subgraph owns; a host leaves the subgraph out.`,
              expected: `a name the host's ${owner} subgraph does not own`,
              received: claim,
              repair: `Rename ${claim} in the subgraph's schema.`,
            }),
          ),
      ];
    });
  },
};

const schemaFirstSdlCheck: SubgraphCheck = {
  name: "subgraph-schema-first-sdl",
  run: ({ subgraphs }) => schemaFirstSdlConflicts(subgraphs),
};

/**
 * @experimental The checks `ph model check` adds when a project has a
 * code-first subgraph. A caller registers them with
 * `[...documentModelChecks, ...subgraphChecks]` and a
 * {@link SubgraphChecksInput}.
 */
export const subgraphChecks: readonly SubgraphCheck[] = Object.freeze([
  descriptionsCheck,
  namesCheck,
  typeConflictsCheck,
  documentModelTypesCheck,
  packageScalarsCheck,
  hostAdmissionCheck,
  schemaFirstSdlCheck,
]);
