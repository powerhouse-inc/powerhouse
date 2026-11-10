import type {
  DefinitionDiagnostic,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { loadGraphQL } from "../../graphql/parse-schema.js";
import { projectSubgraphGraphQL } from "../../../subgraph/projection.js";
import {
  conflictingClaims,
  isRootFieldClaim,
  type SubgraphClaims,
  subgraphClaims,
} from "../claims.js";
import { subgraphToolingDiagnostics } from "../diagnostic-codes.js";
import type { CodeFirstSubgraph } from "../read.js";

/**
 * @experimental The source text of one schema-first subgraph, as ph-cli
 * finds it next to the subgraph's class. Tooling never imports or
 * constructs a schema-first class, so its SDL is read from text.
 */
export type SchemaFirstSubgraphSource = {
  /** The subgraph's directory, `./subgraphs/<dir>/`. */
  readonly unit: `./${string}`;
  /** The name the class assigns, when its text shows a literal one. */
  readonly name: string | null;
  /** The file the SDL is read from. */
  readonly source: DefinitionSource;
  /** `graphql` for an SDL file, `typescript` for a module holding gql templates. */
  readonly language: "graphql" | "typescript";
  /** `null` when the subgraph has no file to read. */
  readonly text: string | null;
};

type SchemaFirstSdl =
  | {
      readonly kind: "read";
      readonly claims: SubgraphClaims;
    }
  | { readonly kind: "unchecked"; readonly reason: string };

const TEMPLATE = /\b(?:gql|graphql)\s*`((?:\\[\s\S]|[^`\\])*)`/g;
const RELATIVE_IMPORT = /\bfrom\s*["']\.\.?\//;

function sdlText(
  source: SchemaFirstSubgraphSource,
): { readonly sdl: string } | { readonly reason: string } {
  if (source.text === null) {
    return {
      reason: "the subgraph has no schema.graphql, schema.ts or index.ts",
    };
  }
  if (source.language === "graphql") return { sdl: source.text };
  const templates = [...source.text.matchAll(TEMPLATE)].map(
    (match) => match[1],
  );
  if (templates.some((template) => template.includes("${"))) {
    return { reason: "its gql template interpolates values" };
  }
  if (templates.length === 0) {
    return {
      reason: RELATIVE_IMPORT.test(source.text)
        ? "its SDL is imported from another module"
        : "it holds no gql template",
    };
  }
  return { sdl: templates.join("\n") };
}

function readSchemaFirstSdl(source: SchemaFirstSubgraphSource): SchemaFirstSdl {
  const text = sdlText(source);
  if ("reason" in text) return { kind: "unchecked", reason: text.reason };
  let graphql: ReturnType<typeof loadGraphQL>;
  try {
    graphql = loadGraphQL();
  } catch (error) {
    return {
      kind: "unchecked",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    const document = graphql.parse(text.sdl, { noLocation: true });
    return { kind: "read", claims: subgraphClaims(document) };
  } catch (error) {
    return {
      kind: "unchecked",
      reason: `its SDL does not parse: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function describeClaim(claim: string): string {
  return isRootFieldClaim(claim) ? `root field ${claim}` : `type ${claim}`;
}

/**
 * Advisory warnings for a project with code-first and schema-first
 * subgraphs: a shared name, a shared root field, or a type defined
 * differently. The host keeps deciding at runtime; nothing here is an
 * error. SDL that cannot be read from text is reported as not checked.
 */
export function schemaFirstSdlConflicts(input: {
  readonly codeFirst: readonly CodeFirstSubgraph[];
  readonly schemaFirst: readonly SchemaFirstSubgraphSource[];
}): readonly DefinitionDiagnostic[] {
  if (input.codeFirst.length === 0) return [];
  const codeFirst = input.codeFirst.map((subgraph) => ({
    subgraph,
    claims: subgraphClaims(projectSubgraphGraphQL(subgraph.definition)),
  }));
  const diagnostics: DefinitionDiagnostic[] = [];
  for (const schemaFirstSubgraph of input.schemaFirst) {
    const named = codeFirst.find(
      ({ subgraph }) =>
        schemaFirstSubgraph.name !== null &&
        subgraph.name === schemaFirstSubgraph.name,
    );
    if (named !== undefined) {
      diagnostics.push(
        subgraphToolingDiagnostics.create({
          code: "PH-SG-SCHEMA-FIRST-CONFLICT",
          source: schemaFirstSubgraph.source,
          definition: { kind: "subgraph", key: named.subgraph.name },
          path: [],
          message: `The schema-first subgraph in ${schemaFirstSubgraph.unit} and a code-first subgraph are both named ${named.subgraph.name}; a host serves one of them.`,
          expected: "one subgraph per name",
          received: named.subgraph.name,
          repair: "Rename one of the subgraphs.",
          related: [
            {
              source: named.subgraph.source,
              path: [],
              message: "The code-first subgraph with this name.",
            },
          ],
        }),
      );
    }
    const read = readSchemaFirstSdl(schemaFirstSubgraph);
    if (read.kind === "unchecked") {
      diagnostics.push(
        subgraphToolingDiagnostics.create({
          code: "PH-SG-SCHEMA-FIRST-UNCHECKED",
          source: schemaFirstSubgraph.source,
          path: [],
          message: `The schema-first subgraph in ${schemaFirstSubgraph.unit} was not checked against the code-first subgraphs: ${read.reason}.`,
          expected:
            "SDL in a schema.graphql file or a gql template without interpolation",
          received: read.reason,
          repair:
            "Nothing is required. To have its conflicts checked, keep its SDL in one gql template or a schema.graphql file.",
        }),
      );
      continue;
    }
    for (const { subgraph, claims } of codeFirst) {
      for (const claim of conflictingClaims(read.claims, claims)) {
        diagnostics.push(
          subgraphToolingDiagnostics.create({
            code: "PH-SG-SCHEMA-FIRST-CONFLICT",
            source: subgraph.source,
            definition: { kind: "subgraph", key: subgraph.name },
            path: [],
            message: `Code-first subgraph ${subgraph.name} and the schema-first subgraph in ${schemaFirstSubgraph.unit} both claim ${describeClaim(claim)}; the host serves the claim from one of them only.`,
            expected: isRootFieldClaim(claim)
              ? "each root field served by one subgraph"
              : "one definition per type name",
            received: claim,
            repair: isRootFieldClaim(claim)
              ? "Rename the root field in one of the subgraphs."
              : "Rename the type in one subgraph, or define it identically in both.",
            related: [
              {
                source: schemaFirstSubgraph.source,
                path: [],
                message: `The schema-first subgraph claims ${claim} here.`,
              },
            ],
          }),
        );
      }
    }
  }
  return diagnostics;
}
