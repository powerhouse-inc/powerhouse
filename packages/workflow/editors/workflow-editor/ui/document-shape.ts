// What the {} picker offers for a journaled document reference: the
// reference's own header fields, and the global state fields of its model.
import type { DocumentReference } from "@powerhousedao/pieces-framework/workflow";
import type { Kind as KindEnum, TypeNode } from "graphql";

// The model's name and its latest global state SDL.
export interface ModelStateSchema {
  name: string;
  schema: string | null;
}

const MAX_DEPTH = 6;

const normalize = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "");

function typeName(
  node: TypeNode,
  kind: typeof KindEnum,
): { name: string; display: string } {
  if (node.kind === kind.NON_NULL_TYPE) {
    const inner = typeName(node.type, kind);
    return { name: inner.name, display: `${inner.display}!` };
  }
  if (node.kind === kind.LIST_TYPE) {
    const inner = typeName(node.type, kind);
    return { name: inner.name, display: `[${inner.display}]` };
  }
  return { name: node.name.value, display: node.name.value };
}

// Fields of `<Model>State` (or `<Model>GlobalState`) as a value whose leaves
// are type names. Unparsable SDL gives no fields.
export async function stateFieldsFromSdl(
  model: ModelStateSchema,
): Promise<Record<string, unknown>> {
  if (!model.schema) return {};
  // Loaded on first use: the editor needs it only for a reference.
  const { Kind, parse } = await import("graphql");
  let definitions;
  try {
    definitions = parse(model.schema).definitions;
  } catch {
    return {};
  }
  const types = new Map<string, readonly { name: string; type: TypeNode }[]>();
  for (const def of definitions) {
    if (
      def.kind !== Kind.OBJECT_TYPE_DEFINITION &&
      def.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION
    ) {
      continue;
    }
    types.set(
      normalize(def.name.value),
      (def.fields ?? []).map((field) => ({
        name: field.name.value,
        type: field.type,
      })),
    );
  }
  const root = [
    `${normalize(model.name)}state`,
    `${normalize(model.name)}globalstate`,
  ]
    .map((candidate) => types.get(candidate))
    .find((fields) => fields !== undefined);
  const build = (
    fields: readonly { name: string; type: TypeNode }[],
    depth: number,
  ): Record<string, unknown> =>
    Object.fromEntries(
      fields.map((field) => {
        const { name, display } = typeName(field.type, Kind);
        const inner = types.get(normalize(name));
        return [
          field.name,
          inner && inner.length > 0 && depth < MAX_DEPTH
            ? build(inner, depth + 1)
            : display,
        ];
      }),
    );
  return root ? build(root, 0) : {};
}

// A document as the picker shows it for a reference: { header, state.global }.
export function documentShape(
  reference: DocumentReference,
  globalState: Record<string, unknown>,
): Record<string, unknown> {
  return {
    header: {
      id: reference.documentId,
      documentType: reference.documentType,
      name: "String",
      slug: "String",
      branch: reference.branch,
      revision: reference.revision,
      createdAtUtcIso: "DateTime!",
      lastModifiedAtUtcIso: "DateTime!",
    },
    state: { global: globalState },
  };
}
