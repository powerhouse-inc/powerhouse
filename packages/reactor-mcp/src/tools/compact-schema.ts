import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";

export type CompactDocumentModelSchema = {
  id: string;
  name: string;
  version: number;
  /** One entry per operation: what `addActions` takes as `type`, `scope` and `input`. */
  actions: {
    type: string;
    scope: string;
    /** The input's GraphQL definition, or `null` for an action without input. */
    input: string | null;
  }[];
  /** Definitions of the enums and types the inputs reference from the state schemas. */
  types?: Record<string, string>;
};

const BUILTIN_SCALARS = new Set(["String", "Int", "Float", "Boolean", "ID"]);

function stripComments(source: string) {
  return source
    .replace(/"""[\s\S]*?"""/g, "")
    .replace(/"[^"\n]*"/g, "")
    .replace(/#[^\n]*/g, "");
}

function collapse(definition: string) {
  return stripComments(definition).replace(/\s+/g, " ").trim();
}

/** Named enum, input, type and union definitions in a GraphQL source. */
function definitionsOf(source: string) {
  const definitions = new Map<string, string>();
  const pattern =
    /\b(?:enum|input|type)\s+(\w+)[^{]*\{[^}]*\}|\bunion\s+(\w+)\s*=\s*\|?\s*\w+(?:\s*\|\s*\w+)*/g;
  for (const [definition, name, unionName] of stripComments(source).matchAll(
    pattern,
  )) {
    // An unmatched group is undefined at runtime, whatever its type says.
    definitions.set(name || unionName, collapse(definition));
  }
  return definitions;
}

function referencedNames(definition: string) {
  const names = new Set<string>();
  for (const match of definition.matchAll(/:\s*\[?\s*(\w+)/g)) {
    names.add(match[1]);
  }
  for (const match of definition.matchAll(/=\s*([\w\s|]+)/g)) {
    for (const name of match[1].split("|")) names.add(name.trim());
  }
  return names;
}

/** The parts of a document model's latest specification that writing actions needs. */
export function compactDocumentModelSchema(
  model: DocumentModelGlobalState,
): CompactDocumentModelSchema {
  const spec = model.specifications.at(-1);
  const operations = spec?.modules.flatMap((module) => module.operations) ?? [];
  const stateDefinitions = definitionsOf(
    Object.values(spec?.state ?? {})
      .map((state) => state.schema)
      .join("\n"),
  );

  const types: Record<string, string> = {};
  const visit = (definition: string, local: Map<string, string>) => {
    for (const name of referencedNames(definition)) {
      if (BUILTIN_SCALARS.has(name) || local.has(name) || name in types) {
        continue;
      }
      const referenced = stateDefinitions.get(name);
      if (!referenced) continue;
      types[name] = referenced;
      visit(referenced, local);
    }
  };

  const actions = operations.flatMap((operation) => {
    if (!operation.name) return [];
    const input = operation.schema ? collapse(operation.schema) : null;
    if (operation.schema)
      visit(operation.schema, definitionsOf(operation.schema));
    return [{ type: operation.name, scope: operation.scope, input }];
  });

  return {
    id: model.id,
    name: model.name,
    version: spec?.version ?? 1,
    actions,
    ...(Object.keys(types).length ? { types } : {}),
  };
}
