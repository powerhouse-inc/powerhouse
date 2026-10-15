import type {
  DefinitionDiagnostic,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { createDiagnostic } from "document-model";
import type {
  HostValidationRequest,
  HostValidationResult,
} from "document-model/tooling";
import {
  buildPackageSubgraph,
  type CodeFirstSubgraph,
  findPackageSubgraphFindings,
  type LabeledSubgraph,
  readCodeFirstSubgraph,
} from "./subgraph-types.js";

/**
 * Validates each code-first subgraph in a selection against the augmented
 * schema the host serves, then warns about each model and subgraph, of the
 * selection or of the package's schema-first side, that the server would
 * refuse or leave out of the supergraph. A subgraph that names a host-declared
 * type such as `OID` or `DocumentDrive` is valid, because the host declares it.
 */
export function validateSubgraphsForHost(
  request: HostValidationRequest,
): HostValidationResult {
  request.signal?.throwIfAborted();
  const diagnostics: DefinitionDiagnostic[] = [];
  const subjects: Subject[] = [...(request.schemaFirst?.subgraphs ?? [])];
  for (const entry of request.subgraphs) {
    const subgraph = readCodeFirstSubgraph(entry);
    if (subgraph === null) continue;
    if (subgraph.typeDefs === null) {
      diagnostics.push(
        createDiagnostic({
          code: "PH-SG-DEFINITION-INVALID",
          source: entry.source,
          path: entry.path.map(String),
          message: `Subgraph ${subgraph.name} publishes no type definitions the host can read.`,
          repair: "Rebuild the package with a matching compiler.",
        }),
      );
      continue;
    }
    subjects.push({
      name: subgraph.name,
      label: subgraph.label,
      typeDefs: subgraph.typeDefs,
      source: entry.source,
      codeFirst: {
        path: entry.path.map(String),
        scalarResolvers: subgraph.scalarResolvers,
      },
    });
  }

  // buildSubgraphSchema validates as it builds and throws, so building is the
  // check. validateSchema cannot run on the result, because @apollo/subgraph
  // loads graphql's CommonJS entry, this package loads the ESM entry, and
  // graphql checks type identity with instanceof.
  const findings = findPackageSubgraphFindings(
    [...(request.schemaFirst?.documentModels ?? []), ...request.documentModels],
    subjects,
    (subject, host) =>
      buildPackageSubgraph(
        subject,
        host,
        subject.codeFirst === undefined
          ? { reportScalars: false }
          : {
              resolvers: subject.codeFirst.scalarResolvers,
              reportScalars: true,
            },
      ),
  );
  for (const { claim, code, message, repair, ...about } of findings) {
    if ("model" in about) {
      diagnostics.push(
        createDiagnostic({
          code,
          message,
          repair,
          definition: { kind: "document-model", key: about.model.id },
          path: ["composition", about.model.name],
          received: about.model.name,
        }),
      );
      continue;
    }
    for (const { name, source, codeFirst } of about.subgraphs) {
      if (code === "PH-SG-SCHEMA-INVALID") {
        // `ph generate` warns about a schema-first schema that does not build.
        if (codeFirst === undefined) continue;
        diagnostics.push(
          createDiagnostic({
            code,
            message,
            repair,
            source,
            path: codeFirst.path,
          }),
        );
        continue;
      }
      diagnostics.push(
        createDiagnostic({
          code,
          message,
          repair,
          source,
          path:
            claim === undefined
              ? ["composition", name]
              : ["composition", name, claim],
          received: name,
        }),
      );
    }
  }

  return { completed: true, diagnostics };
}

type Subject = LabeledSubgraph & {
  readonly source: DefinitionSource;
  /** Absent for a schema-first subgraph. */
  readonly codeFirst?: {
    readonly path: readonly string[];
    readonly scalarResolvers: CodeFirstSubgraph["scalarResolvers"];
  };
};
