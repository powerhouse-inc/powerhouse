import {
  deprecationWarned,
  legacyAuthoringText,
  warnDeprecations,
} from "@powerhousedao/shared/clis/deprecations";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  isLegacyDocumentModelModule,
  readSubgraphProtocol,
} from "document-model";
import type { SubgraphClass } from "../graphql/types.js";
import { isSubgraphClass } from "../graphql/utils.js";

/**
 * The static member of the class `defineIndexSubgraph` returns. `Symbol.for`
 * makes it the same key in every copy of the package.
 */
export const INDEX_SUBGRAPH: unique symbol = Symbol.for(
  "powerhouse.subgraph.index",
);

/**
 * Whether a value a package loader returned is a legacy subgraph: a class
 * that extends `BaseSubgraph` and carries no subgraph protocol. An index
 * subgraph is not one, because what replaces `defineIndexSubgraph` ships in
 * 6.4.
 */
export function isLegacySubgraphClass(candidate: unknown): boolean {
  return (
    isSubgraphClass(candidate) &&
    readSubgraphProtocol(candidate).kind === "schema-first" &&
    !(INDEX_SUBGRAPH in candidate)
  );
}

/**
 * Warns that the project under development has legacy document models or
 * legacy subgraphs, once per process and project. The record is in `env`, so
 * it outlives reloads; a set of legacy modules that changes later does not
 * warn again. Silent for a project with none.
 */
export function warnLegacyAuthoring(
  project: string,
  loaded: {
    documentModels: readonly DocumentModelModule[];
    subgraphs: readonly SubgraphClass[];
  },
  warn: (line: string) => void,
  env: Record<string, string | undefined> = process.env,
): void {
  const id = `legacy-authoring:${encodeURIComponent(project)}`;
  if (deprecationWarned(id, env)) return;
  const text = legacyAuthoringText({
    documentModels: loaded.documentModels
      .filter(isLegacyDocumentModelModule)
      .map((module) => module.documentModel.global.id),
    subgraphs: loaded.subgraphs
      .filter(isLegacySubgraphClass)
      .map((subgraph) => subgraph.name || "an unnamed class"),
  });
  if (text === undefined) return;
  warnDeprecations([{ id, text, link: null }], env, warn);
}
