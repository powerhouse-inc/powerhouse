import type {
  InputTypeDefinition,
  NamedGraphQLTypeDefinition,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";

/**
 * Which stored segment the compiler prints each named type in.
 *
 * - An operation segment declares the operation's own input, which codegen
 *   selects there by name, plus the input types it reaches that no earlier
 *   segment declares.
 * - A type only the local root reaches goes to the local segment.
 * - Everything else, including an input type no operation reaches, goes to
 *   the global segment, which is where the host looks for one
 *   (`create-schema.ts` re-extracts input definitions from the state schema).
 *
 * A schema-first stored string need not follow this layout, because codegen
 * concatenates every segment, so the retained-serialization check reads it
 * back only for canonical-v1 artifacts.
 */

export type SegmentOperation = {
  /** `${moduleKey}/${operationKey}`, the operation's serialization path. */
  readonly key: string;
  readonly input: InputTypeDefinition | null;
};

export type StoredSegments = {
  readonly global: readonly NamedGraphQLTypeDefinition[];
  readonly local: readonly NamedGraphQLTypeDefinition[];
  readonly operations: ReadonlyMap<
    string,
    readonly NamedGraphQLTypeDefinition[]
  >;
};

function referencedNames(
  definition: NamedGraphQLTypeDefinition,
): readonly string[] {
  const names: string[] = [];
  const visit = (reference: TypeReferenceDefinition): void => {
    if (reference.kind === "list") {
      visit(reference.item);
      return;
    }
    if (reference.kind === "named") names.push(reference.name);
  };
  switch (definition.kind) {
    case "enum":
      return names;
    case "union":
      return definition.members;
    case "input":
      definition.fields.forEach((field) => visit(field.type));
      return names;
    case "object":
    case "interface":
      names.push(...(definition.implements ?? []));
      for (const field of definition.fields) {
        field.args?.forEach((argument) => visit(argument.type));
        visit(field.type);
      }
      return names;
  }
}

function reachableFrom(
  rootName: string | null,
  index: ReadonlyMap<string, NamedGraphQLTypeDefinition>,
): ReadonlySet<string> {
  const reached = new Set<string>();
  if (rootName === null) return reached;
  const queue = [rootName];
  while (queue.length > 0) {
    const name = queue.pop() as string;
    if (reached.has(name)) continue;
    const definition = index.get(name);
    if (definition === undefined) continue;
    reached.add(name);
    queue.push(...referencedNames(definition));
  }
  return reached;
}

export function assignStoredSegments(input: {
  readonly types: readonly NamedGraphQLTypeDefinition[];
  readonly globalRoot: string;
  readonly localRoot: string | null;
  readonly operations: readonly SegmentOperation[];
}): StoredSegments {
  const stateIndex = new Map(
    input.types.map((definition) => [definition.name, definition]),
  );
  const globalReach = reachableFrom(input.globalRoot, stateIndex);
  const localReach = reachableFrom(input.localRoot, stateIndex);

  const operationIndex = new Map(stateIndex);
  for (const operation of input.operations) {
    if (operation.input !== null) {
      operationIndex.set(operation.input.name, operation.input);
    }
  }

  const claimed = new Set<string>();
  const operations = new Map<string, readonly NamedGraphQLTypeDefinition[]>();
  for (const operation of input.operations) {
    if (operation.input === null) continue;
    claimed.add(operation.input.name);
    const reached = reachableFrom(operation.input.name, operationIndex);
    const supporting = input.types.filter(
      (definition) =>
        definition.kind === "input" &&
        reached.has(definition.name) &&
        !claimed.has(definition.name),
    );
    for (const definition of supporting) claimed.add(definition.name);
    operations.set(operation.key, [operation.input, ...supporting]);
  }

  const local = input.types.filter(
    (definition) =>
      definition.kind !== "input" &&
      localReach.has(definition.name) &&
      !globalReach.has(definition.name),
  );
  const localDeclared = new Set(local.map((definition) => definition.name));
  const global = input.types.filter(
    (definition) =>
      !localDeclared.has(definition.name) && !claimed.has(definition.name),
  );
  return { global, local, operations };
}
