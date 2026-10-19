import { scalarCatalog } from "document-model";
import {
  buildASTSchema,
  type DocumentNode,
  lexicographicSortSchema,
  parse,
  print,
  printSchema,
  visit,
} from "graphql";

export const typedConversions: ReadonlySet<string> = new Set([
  "system",
  "packages",
  "auth",
  "inspection",
]);

/**
 * The host prelude declares every catalog scalar for every subgraph, so SDL
 * may reference one it does not declare, while a typed subgraph declares each
 * catalog scalar it uses. Both sides get the missing declarations; any other
 * undeclared type still fails to build.
 */
function withHostScalars(source: string): DocumentNode {
  const document = parse(source);
  const declared = new Set<string>();
  const referenced = new Set<string>();
  visit(document, {
    ScalarTypeDefinition: (node) => {
      declared.add(node.name.value);
    },
    NamedType: (node) => {
      referenced.add(node.name.value);
    },
  });
  const missing = scalarCatalog.names.filter(
    (name) => referenced.has(name) && !declared.has(name),
  );
  return parse([...missing.map((name) => `scalar ${name}`), source].join("\n"));
}

function byName<T extends { readonly name: { readonly value: string } }>(
  values: readonly T[] | undefined,
): T[] | undefined {
  return (
    values &&
    [...values].sort((a, b) => a.name.value.localeCompare(b.name.value))
  );
}

export function normalizeTypedGolden(name: string, source: string): string {
  const [subgraph, kind, extension] = name.split(".");
  if (!typedConversions.has(subgraph) || extension !== "graphql") return source;
  if (kind === "authored") {
    return printSchema(
      lexicographicSortSchema(buildASTSchema(withHostScalars(source))),
    );
  }
  if (kind !== "federation") return source;
  return print(
    visit(parse(source), {
      Document: {
        leave: (node) => ({
          ...node,
          definitions: [...node.definitions].sort((a, b) =>
            print(a).localeCompare(print(b)),
          ),
        }),
      },
      ObjectTypeDefinition: (node) => ({
        ...node,
        fields: byName(node.fields),
        interfaces: byName(node.interfaces),
      }),
      ObjectTypeExtension: (node) => ({
        ...node,
        fields: byName(node.fields),
        interfaces: byName(node.interfaces),
      }),
      InterfaceTypeDefinition: (node) => ({
        ...node,
        fields: byName(node.fields),
        interfaces: byName(node.interfaces),
      }),
      InterfaceTypeExtension: (node) => ({
        ...node,
        fields: byName(node.fields),
        interfaces: byName(node.interfaces),
      }),
      FieldDefinition: (node) => ({
        ...node,
        arguments: byName(node.arguments),
      }),
      Directive: (node) => ({ ...node, arguments: byName(node.arguments) }),
      DirectiveDefinition: (node) => ({
        ...node,
        arguments: byName(node.arguments),
        locations: [...node.locations].sort((a, b) =>
          a.value.localeCompare(b.value),
        ),
      }),
      EnumTypeDefinition: (node) => ({ ...node, values: byName(node.values) }),
      EnumTypeExtension: (node) => ({ ...node, values: byName(node.values) }),
      InputObjectTypeDefinition: (node) => ({
        ...node,
        fields: byName(node.fields),
      }),
      InputObjectTypeExtension: (node) => ({
        ...node,
        fields: byName(node.fields),
      }),
      UnionTypeDefinition: (node) => ({ ...node, types: byName(node.types) }),
      UnionTypeExtension: (node) => ({ ...node, types: byName(node.types) }),
      SchemaDefinition: (node) => ({
        ...node,
        operationTypes: [...node.operationTypes].sort((a, b) =>
          a.operation.localeCompare(b.operation),
        ),
      }),
      SchemaExtension: (node) => ({
        ...node,
        operationTypes: [...(node.operationTypes ?? [])].sort((a, b) =>
          a.operation.localeCompare(b.operation),
        ),
      }),
      ObjectValue: (node) => ({ ...node, fields: byName(node.fields) }),
    }),
  );
}
