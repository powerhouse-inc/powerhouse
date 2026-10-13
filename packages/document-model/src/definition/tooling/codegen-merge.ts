import type {
  DefinitionPath,
  FieldDefinition,
  InputFieldDefinition,
  LocationFreeGraphQLDocumentNode,
  NamedGraphQLTypeDefinition,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { mergeTypeDefs } from "@graphql-tools/merge";
import { type DocumentNode, print } from "graphql";
import { canonicalJson, compareCodeUnits } from "../primitives.js";
import { printTypeReference } from "../printer.js";
import { structuredTypesFromDocument } from "./ast-to-structured.js";
import { schemaFirstGraphQLDocument } from "./graphql-document.js";

/**
 * Codegen loads the joined stored strings through graphql-tools'
 * `mergeTypeDefs`, so a repeated declaration means what that merge makes of
 * it.
 */
export function mergedDeclaration(
  documents: readonly LocationFreeGraphQLDocumentNode[],
  name: string,
  declared: ReadonlySet<string>,
  path: DefinitionPath,
): { readonly type: NamedGraphQLTypeDefinition } | { readonly error: string } {
  const definitions = documents.flatMap((document) =>
    document.definitions.filter(
      (node) =>
        /Type(Definition|Extension)$/.test(node.kind) &&
        "name" in node &&
        node.name.value === name,
    ),
  );
  let merged: string;
  try {
    merged = print(
      mergeTypeDefs([
        { kind: "Document", definitions } as unknown as DocumentNode,
      ]),
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  // Merged nodes omit the empty lists the structured reader expects.
  const [type] = structuredTypesFromDocument(
    schemaFirstGraphQLDocument([merged]).document,
    declared,
    path,
  ).types;
  return { type };
}

type Field = FieldDefinition | InputFieldDefinition;

/** One member of a type's generated validator, and how SDL spells it. */
type Member = { readonly generated: string; readonly spelled: string };

type Signature = {
  readonly kind: NamedGraphQLTypeDefinition["kind"];
  readonly members: ReadonlyMap<string, Member>;
};

// graphql-codegen-typescript-validation-schema 0.18.1 (zodv4
// `generateFieldTypeZodSchema`, `directive.js`) with codegen's
// `directives: { equals: { value: ["regex", "/^$1$/"] } }`: a nullable list
// item gets neither directives nor a default; a nullable list gets the
// directives; any other named slot gets them, and an input value also gets a
// scalar or enum literal default. Only `@equals(value:)` emits anything. The
// plugin reads the built schema, which coerces a list field's default into a
// list literal, so no slot of a list field gets a default.
function generatedSchema(
  field: Field,
  reference: TypeReferenceDefinition = field.type,
  inList = false,
): string {
  const parent = reference.required ? "required" : inList ? "list" : "field";
  const directives = (field.directives ?? [])
    .filter((directive) => directive.name === "equals")
    .flatMap((directive) =>
      directive.arguments.filter((argument) => argument.name === "value"),
    )
    .map((argument) => `.regex(${canonicalJson(argument.value)})`)
    .join("");
  if (reference.kind === "list") {
    const array = `[${generatedSchema(field, reference.item, true)}]`;
    return parent === "required" ? array : `${array}${directives}?`;
  }
  if (parent === "list") return `${reference.name}?`;
  const value =
    "defaultValue" in field && !inList ? field.defaultValue : undefined;
  const applied =
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
      ? `.default(${JSON.stringify(value)})`
      : "";
  const schema = `${reference.name}${directives}${applied}`;
  return parent === "required" ? schema : `${schema}?`;
}

function spelled(field: Field): string {
  const value =
    "defaultValue" in field ? ` = ${JSON.stringify(field.defaultValue)}` : "";
  const directives = (field.directives ?? [])
    .map(
      ({ name, arguments: args }) =>
        ` @${name}${args.length === 0 ? "" : `(${args.map((arg) => `${arg.name}: ${JSON.stringify(arg.value)}`).join(", ")})`}`,
    )
    .join("");
  return `${printTypeReference(field.type)}${value}${directives}`;
}

/** Fields of an object or interface also generate an `…Args` schema. */
function argumentsMember(field: FieldDefinition): Member | undefined {
  if (field.args === undefined || field.args.length === 0) return undefined;
  const args = [...field.args].sort((left, right) =>
    compareCodeUnits(left.name, right.name),
  );
  return {
    generated: args
      .map((arg) => `${arg.name}: ${generatedSchema(arg)}`)
      .join(", "),
    spelled: `(${field.args.map((arg) => `${arg.name}: ${spelled(arg)}`).join(", ")})`,
  };
}

function signature(type: NamedGraphQLTypeDefinition): Signature {
  if (type.kind === "enum" || type.kind === "union") {
    const names =
      type.kind === "enum"
        ? type.values.map((value) => value.name)
        : type.members;
    return {
      kind: type.kind,
      members: new Map(
        names.map((name) => [name, { generated: "", spelled: "" }]),
      ),
    };
  }
  const members = new Map<string, Member>();
  for (const field of type.fields) {
    members.set(field.name, {
      generated: generatedSchema(field),
      spelled: spelled(field),
    });
    const args = "args" in field ? argumentsMember(field) : undefined;
    if (args !== undefined) members.set(`${field.name}(…)`, args);
  }
  if (type.kind === "input" && members.size === 0) {
    members.set("_empty", { generated: "Boolean?", spelled: "Boolean" });
  }
  return { kind: type.kind, members };
}

export function generatedDifference(
  merged: NamedGraphQLTypeDefinition,
  kept: NamedGraphQLTypeDefinition,
): string | undefined {
  const generated = signature(merged);
  const compiled = signature(kept);
  if (generated.kind !== compiled.kind) {
    return `code generation builds a ${generated.kind} type, the adapter keeps a ${compiled.kind} type`;
  }
  const names = [
    ...new Set([...generated.members.keys(), ...compiled.members.keys()]),
  ].sort(compareCodeUnits);
  for (const member of names) {
    const left = generated.members.get(member);
    const right = compiled.members.get(member);
    if (left?.generated === right?.generated) continue;
    if (right === undefined) {
      return `code generation's ${merged.name} has ${member}, which the declaration the adapter keeps lacks`;
    }
    if (left === undefined) {
      return `the declaration the adapter keeps has ${member}, which code generation's ${merged.name} lacks`;
    }
    return `code generation reads ${merged.name}.${member} as \`${left.spelled}\`, the declaration the adapter keeps as \`${right.spelled}\``;
  }
  return undefined;
}
