import type {
  DefinitionPath,
  DocumentSpecification,
} from "@powerhousedao/shared/document-model";
import type { DefinitionRelocation } from "../adapters/producer.js";
import type { NormalizedDocumentModelArtifact } from "../adapters/types.js";
import { parseSchema } from "../graphql/parse-schema.js";
import { storedSchemaSegments } from "./schema-first-document-model-module-adapter.js";

type SegmentDeclarations = {
  /** The segment of each node of the retained document, in document order. */
  readonly nodes: readonly DefinitionPath[];
  /** The first segment that defines each type, else the first that extends it. */
  readonly types: ReadonlyMap<string, DefinitionPath>;
};

function segmentDeclarations(
  specification: DocumentSpecification,
  path: DefinitionPath,
): SegmentDeclarations {
  const nodes: DefinitionPath[] = [];
  const defined = new Map<string, DefinitionPath>();
  const extended = new Map<string, DefinitionPath>();
  for (const segment of storedSchemaSegments(specification, path)) {
    // The adapter produced an artifact, so every segment parsed.
    const parsed = parseSchema(segment.schema);
    if (!parsed.ok) continue;
    for (const node of parsed.document.definitions) {
      nodes.push(segment.path);
      const name = "name" in node ? node.name.value : undefined;
      if (name === undefined) continue;
      const first = node.kind.endsWith("Extension") ? extended : defined;
      if (!first.has(name)) first.set(name, segment.path);
    }
  }
  return { nodes, types: new Map([...extended, ...defined]) };
}

/**
 * A schema-first author edits the stored file, which is the served global
 * state, and declares types in its SDL segments rather than as structured
 * types. Served paths lose their `documentModel/global` prefix; a type, a
 * scalar or a retained document node points at the segment that declares it.
 * Every result is cut back to the deepest member the stored file has, so no
 * location names a normalized-only member or reaches inside an SDL string.
 */
export function storedModelRelocation(
  artifact: NormalizedDocumentModelArtifact,
): DefinitionRelocation {
  const stored = artifact.documentModel.global.specifications;
  const declarations = new Map<number, SegmentDeclarations>();
  const declared = (index: number): SegmentDeclarations => {
    let found = declarations.get(index);
    if (found === undefined) {
      found = segmentDeclarations(stored[index], ["specifications", index]);
      declarations.set(index, found);
    }
    return found;
  };
  const relocate = (path: DefinitionPath): DefinitionPath => {
    if (path[0] === "documentModel" && path[1] === "global") {
      return path.slice(2);
    }
    const [root, index, member, ...rest] = path;
    if (
      root !== "specifications" ||
      typeof index !== "number" ||
      stored.at(index) === undefined
    ) {
      return path;
    }
    const specification: DefinitionPath = ["specifications", index];
    if (member === "types") {
      const name =
        typeof rest[0] === "number"
          ? artifact.definition.specifications.at(index)?.types.at(rest[0])
              ?.name
          : undefined;
      return (
        (name === undefined ? undefined : declared(index).types.get(name)) ??
        specification
      );
    }
    if (member === "scalars") {
      const name =
        typeof rest[0] === "number"
          ? artifact.definition.specifications.at(index)?.scalars.at(rest[0])
              ?.name
          : undefined;
      return (
        (name === undefined ? undefined : declared(index).types.get(name)) ??
        specification
      );
    }
    if (member === "graphQLCompatibility") {
      const [document, definitions, node] = rest;
      return (
        (document === "document" &&
        definitions === "definitions" &&
        typeof node === "number"
          ? declared(index).nodes.at(node)
          : undefined) ?? specification
      );
    }
    return path;
  };
  return (path) => storedPrefix(artifact.documentModel.global, relocate(path));
}

function storedPrefix(stored: unknown, path: DefinitionPath): DefinitionPath {
  let value = stored;
  let depth = 0;
  for (const segment of path) {
    if (typeof value !== "object" || value === null) break;
    if (!Object.hasOwn(value, segment)) break;
    value = (value as Readonly<Record<string | number, unknown>>)[segment];
    depth += 1;
  }
  return path.slice(0, depth);
}
