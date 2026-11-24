import {
  type DocumentNode,
  type FieldDefinitionNode,
  Kind,
  type ObjectTypeDefinitionNode,
  type ObjectTypeExtensionNode,
  parse,
  print,
  type TypeNode,
} from "graphql";
import { schemaFirstSource } from "document-model/tooling";
import { dedent } from "./dedent.js";
import { byText } from "./project-fs.js";

/** The gql templates of a module, as the definition tooling reads them
 * (`sdlText` in document-model's `subgraph/schema-first/sdl-conflicts.ts`). */
const TEMPLATE = /\b(?:gql|graphql)\s*`((?:\\[\s\S]|[^`\\])*)`/g;

export type SubgraphSchema = {
  schema: { source: string; file: string } | null;
  queries: string[];
  mutations: string[];
};

export const noSchema = (): SubgraphSchema => ({
  schema: null,
  queries: [],
  mutations: [],
});

type ObjectNode = ObjectTypeDefinitionNode | ObjectTypeExtensionNode;

function namedType(type: TypeNode): string | undefined {
  if (type.kind === Kind.NAMED_TYPE) return type.name.value;
  return type.kind === Kind.NON_NULL_TYPE ? namedType(type.type) : undefined;
}

function signature(field: FieldDefinitionNode): string {
  const args = (field.arguments ?? []).map(
    (argument) =>
      `${argument.name.value}: ${print(argument.type)}${
        argument.defaultValue === undefined
          ? ""
          : ` = ${print(argument.defaultValue)}`
      }`,
  );
  return `${field.name.value}${args.length === 0 ? "" : `(${args.join(", ")})`}: ${print(field.type)}`;
}

/**
 * The fields of the root type `root`, sorted. Generated subgraphs put theirs under a
 * namespace field (`invoiceStats: InvoiceStatsSubgraphQueries!`), which is
 * flattened one level: a field without arguments whose type is an object of
 * this schema named `…Queries` under `Query`, `…Mutations` under `Mutation`.
 */
function rootFields(
  document: DocumentNode,
  root: "Query" | "Mutation",
): string[] {
  const objects = document.definitions.filter(
    (definition): definition is ObjectNode =>
      definition.kind === Kind.OBJECT_TYPE_DEFINITION ||
      definition.kind === Kind.OBJECT_TYPE_EXTENSION,
  );
  const fieldsOf = (name: string) =>
    objects
      .filter((object) => object.name.value === name)
      .flatMap((object) => object.fields ?? []);
  const suffix = root === "Query" ? "Queries" : "Mutations";
  const fields = fieldsOf(root).flatMap((field) => {
    const type = namedType(field.type);
    const namespaced =
      type !== undefined &&
      type.endsWith(suffix) &&
      (field.arguments ?? []).length === 0
        ? fieldsOf(type)
        : [];
    return namespaced.length === 0
      ? [signature(field)]
      : namespaced.map((inner) => `${field.name.value}.${signature(inner)}`);
  });
  return fields.sort(byText);
}

/**
 * The SDL a schema-first subgraph declares in `schema.graphql`, or in the gql
 * templates of `schema.ts` or `index.ts`, and its root fields. Nothing is
 * imported or run, so SDL built at runtime (an interpolated template, or one
 * imported from another module) reads as no schema.
 */
export function readSubgraphSchema(root: string, dir: string): SubgraphSchema {
  const { source, language, text } = schemaFirstSource(root, dir);
  if (text === null) return noSchema();
  const templates =
    language === "graphql"
      ? [text]
      : [...text.matchAll(TEMPLATE)].map((match) => match[1]);
  if (
    templates.length === 0 ||
    (language === "typescript" &&
      templates.some((template) => template.includes("${")))
  ) {
    return noSchema();
  }
  const sdl = templates.map(dedent).join("\n\n");
  const schema = { source: sdl, file: source.specifier.replace(/^\.\//, "") };
  try {
    const document = parse(sdl, { noLocation: true });
    return {
      schema,
      queries: rootFields(document, "Query"),
      mutations: rootFields(document, "Mutation"),
    };
  } catch {
    // SDL that does not parse is still what the file says.
    return { schema, queries: [], mutations: [] };
  }
}
