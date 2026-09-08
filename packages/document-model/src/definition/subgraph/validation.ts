import type {
  FieldDefinitionV1,
  InputFieldDefinitionV1,
  JsonValue,
  NamedGraphQLTypeDefinitionV1,
  SubgraphDefinitionV1,
  TypeReferenceDefinitionV1,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";
import { failDefinition } from "../diagnostics.js";
import { canonicalJson, cloneJson, isGraphQLName } from "../primitives.js";
import { scalarCatalog } from "../scalars/catalog.js";
import { buildTypedSubgraphDocument, toLocationFreeDocument } from "./ast.js";

const graphQLName = z.string().refine(isGraphQLName);
const scalarNames = new Set<string>([
  "ID",
  "String",
  "Boolean",
  "Int",
  "Float",
  ...scalarCatalog.names,
]);
const builtInScalars = new Set(["ID", "String", "Boolean", "Int", "Float"]);
const federationNames = new Set(["_Any", "_Entity", "_Service"]);
const scalarName = graphQLName.refine((value) => scalarNames.has(value));
const nullableString = z.string().nullable();

const typeReference: z.ZodType = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("scalar"),
        name: scalarName,
        required: z.boolean(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("named"),
        name: graphQLName,
        required: z.boolean(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("list"),
        required: z.boolean(),
        item: typeReference,
      })
      .strict(),
  ]),
);

const directive = z
  .object({
    name: graphQLName,
    arguments: z.array(
      z.object({ name: graphQLName, value: z.unknown() }).strict(),
    ),
  })
  .strict();

const fieldBase = {
  key: graphQLName,
  name: graphQLName,
  description: nullableString,
  deprecated: nullableString,
  type: typeReference,
  directives: z.array(directive).optional(),
};

const inputField = z
  .object({
    ...fieldBase,
    defaultValue: z.unknown().optional(),
  })
  .strict();
const outputField = z
  .object({
    ...fieldBase,
    args: z.array(inputField).optional(),
  })
  .strict();

const namedType = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("enum"),
      name: graphQLName,
      description: nullableString,
      values: z
        .array(
          z
            .object({
              name: graphQLName,
              description: nullableString,
              deprecated: nullableString,
              directives: z.array(directive).optional(),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("object"),
      name: graphQLName,
      description: nullableString,
      implements: z.array(graphQLName).optional(),
      fields: z.array(outputField),
    })
    .strict(),
  z
    .object({
      kind: z.literal("interface"),
      name: graphQLName,
      description: nullableString,
      implements: z.array(graphQLName).optional(),
      fields: z.array(outputField),
    })
    .strict(),
  z
    .object({
      kind: z.literal("input"),
      name: graphQLName,
      description: nullableString,
      unknownKeys: z.enum(["preserve", "reject"]),
      fields: z.array(inputField),
    })
    .strict(),
  z
    .object({
      kind: z.literal("union"),
      name: graphQLName,
      description: nullableString,
      members: z.array(graphQLName).min(1),
    })
    .strict(),
]);

const access = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("public") }).strict(),
  z.object({ kind: z.literal("manual") }).strict(),
  z
    .object({ kind: z.literal("document-read"), argument: graphQLName })
    .strict(),
]);

const entry = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.enum(["query", "mutation", "subscription"]),
      key: graphQLName,
      fieldName: graphQLName,
      description: nullableString,
      args: z.array(inputField),
      returns: typeReference,
      access,
      compatibilityName: graphQLName.nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("field"),
      target: z
        .object({ typeName: graphQLName, fieldName: graphQLName })
        .strict(),
      access,
    })
    .strict(),
  z.object({ kind: z.literal("resolveType"), typeName: graphQLName }).strict(),
  z.object({ kind: z.literal("isTypeOf"), typeName: graphQLName }).strict(),
]);

const common = {
  kind: z.literal("powerhouse.subgraph"),
  formatVersion: z.literal(1),
  name: z.string().min(1),
  compositionPolicy: z.literal("host-current"),
  federationProfile: z.literal("host-current"),
};

const definitionSchema = z.discriminatedUnion("schemaKind", [
  z
    .object({
      ...common,
      schemaKind: z.literal("typed"),
      hasSubscriptions: z.boolean(),
      types: z.array(namedType),
      entries: z.array(entry),
      scalars: z.array(
        z
          .object({
            name: scalarName,
            implementation: z
              .string()
              .regex(/^powerhouse\.catalog#[A-Za-z0-9_]+$/),
            graphQLProfile: z.literal("legacy-graphql-default-v1"),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      ...common,
      schemaKind: z.literal("graphql-ast-compat"),
      hasSubscriptions: z.boolean().nullable(),
      document: z.unknown(),
      resolverCoordinates: z.array(
        z
          .object({
            typeName: graphQLName,
            fieldName: graphQLName.nullable(),
            resolverKind: z.enum([
              "field",
              "subscribe",
              "resolve",
              "resolveType",
              "isTypeOf",
              "enum",
              "scalar",
            ]),
          })
          .strict(),
      ),
      access: z.literal("manual"),
    })
    .strict(),
]);

function invalidDefinition(
  path: readonly (string | number)[],
  message: string,
): never {
  return failDefinition({
    code: "PH-GQL-DEFINITION-INVALID",
    path,
    message,
    repair:
      "Export the unchanged structured definition produced by defineSubgraph.",
  });
}

function assertUnique(
  values: readonly string[],
  path: readonly (string | number)[],
  label: string,
): void {
  const seen = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (seen.has(value)) {
      invalidDefinition(
        [...path, index],
        `${label} ${JSON.stringify(value)} is declared more than once.`,
      );
    }
    seen.add(value);
  }
}

function validateTypedDefinition(
  definition: Extract<SubgraphDefinitionV1, { readonly schemaKind: "typed" }>,
): void {
  const typeIndex = new Map<string, NamedGraphQLTypeDefinitionV1>();
  for (let index = 0; index < definition.types.length; index += 1) {
    const type = definition.types[index]!;
    if (typeIndex.has(type.name)) {
      invalidDefinition(
        ["types", index, "name"],
        `GraphQL type ${JSON.stringify(type.name)} is declared more than once.`,
      );
    }
    if (federationNames.has(type.name)) {
      invalidDefinition(
        ["types", index, "name"],
        "Typed Federation definitions require graphql-ast-compat mode.",
      );
    }
    typeIndex.set(type.name, type);
  }

  const usedCustomScalars = new Set<string>();
  const validateReference = (
    reference: TypeReferenceDefinitionV1,
    position: "input" | "output",
    path: readonly (string | number)[],
  ): void => {
    if (reference.kind === "list") {
      validateReference(reference.item, position, [...path, "item"]);
      return;
    }
    if (reference.kind === "scalar") {
      if (!builtInScalars.has(reference.name))
        usedCustomScalars.add(reference.name);
      return;
    }
    const target = typeIndex.get(reference.name);
    if (!target) {
      invalidDefinition(
        path,
        `Referenced GraphQL type ${JSON.stringify(reference.name)} is absent.`,
      );
    }
    const allowed =
      position === "input"
        ? target.kind === "input" || target.kind === "enum"
        : target.kind !== "input";
    if (!allowed) {
      invalidDefinition(
        path,
        `GraphQL type ${JSON.stringify(reference.name)} cannot be used in an ${position} position.`,
      );
    }
  };

  const validateInputFields = (
    fields: readonly InputFieldDefinitionV1[],
    path: readonly (string | number)[],
  ): void => {
    assertUnique(
      fields.map(({ key }) => key),
      path,
      "Input field key",
    );
    assertUnique(
      fields.map(({ name }) => name),
      path,
      "Input field name",
    );
    fields.forEach((field, index) =>
      validateReference(field.type, "input", [...path, index, "type"]),
    );
  };

  const validateOutputFields = (
    fields: readonly FieldDefinitionV1[],
    path: readonly (string | number)[],
  ): void => {
    assertUnique(
      fields.map(({ key }) => key),
      path,
      "Field key",
    );
    assertUnique(
      fields.map(({ name }) => name),
      path,
      "Field name",
    );
    fields.forEach((field, index) => {
      validateReference(field.type, "output", [...path, index, "type"]);
      if (field.args) validateInputFields(field.args, [...path, index, "args"]);
    });
  };

  for (let index = 0; index < definition.types.length; index += 1) {
    const type = definition.types[index]!;
    const path = ["types", index] as const;
    switch (type.kind) {
      case "enum":
        assertUnique(
          type.values.map(({ name }) => name),
          [...path, "values"],
          "Enum value",
        );
        break;
      case "union":
        assertUnique(type.members, [...path, "members"], "Union member");
        type.members.forEach((member, memberIndex) => {
          if (typeIndex.get(member)?.kind !== "object") {
            invalidDefinition(
              [...path, "members", memberIndex],
              `Union member ${JSON.stringify(member)} must name an object type.`,
            );
          }
        });
        break;
      case "input":
        validateInputFields(type.fields, [...path, "fields"]);
        break;
      case "object":
      case "interface":
        validateOutputFields(type.fields, [...path, "fields"]);
        assertUnique(
          type.implements ?? [],
          [...path, "implements"],
          "Implemented interface",
        );
        type.implements?.forEach((name, implementedIndex) => {
          if (typeIndex.get(name)?.kind !== "interface") {
            invalidDefinition(
              [...path, "implements", implementedIndex],
              `Implemented type ${JSON.stringify(name)} must name an interface.`,
            );
          }
        });
        break;
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visitInterface = (name: string): void => {
    if (visiting.has(name)) {
      invalidDefinition(
        ["types", name, "implements"],
        "Interface inheritance must be acyclic.",
      );
    }
    if (visited.has(name)) return;
    visiting.add(name);
    const type = typeIndex.get(name);
    if (type?.kind === "interface") type.implements?.forEach(visitInterface);
    visiting.delete(name);
    visited.add(name);
  };
  for (const type of definition.types) {
    if (type.kind === "interface") visitInterface(type.name);
  }

  const resolverCoordinates = new Set<string>();
  const addCoordinate = (
    coordinate: string,
    path: readonly (string | number)[],
  ): void => {
    if (resolverCoordinates.has(coordinate)) {
      invalidDefinition(
        path,
        `Resolver coordinate ${JSON.stringify(coordinate)} is duplicated.`,
      );
    }
    resolverCoordinates.add(coordinate);
  };
  let hasSubscriptions = false;
  for (let index = 0; index < definition.entries.length; index += 1) {
    const entry = definition.entries[index]!;
    const path = ["entries", index] as const;
    if (
      entry.kind === "query" ||
      entry.kind === "mutation" ||
      entry.kind === "subscription"
    ) {
      const root =
        entry.kind === "query"
          ? "Query"
          : entry.kind === "mutation"
            ? "Mutation"
            : "Subscription";
      if (entry.kind === "subscription") hasSubscriptions = true;
      if (entry.fieldName === "_service" || entry.fieldName === "_entities") {
        invalidDefinition(
          path,
          "Typed Federation entries require graphql-ast-compat mode.",
        );
      }
      validateInputFields(entry.args, [...path, "args"]);
      validateReference(entry.returns, "output", [...path, "returns"]);
      if (entry.access.kind === "document-read") {
        const { argument } = entry.access;
        if (!entry.args.some(({ name }) => name === argument)) {
          invalidDefinition(
            [...path, "access", "argument"],
            "Document-read access must name one of the entry arguments.",
          );
        }
      }
      addCoordinate(`${root}.${entry.fieldName}`, path);
      continue;
    }
    if (entry.kind === "field") {
      const object = typeIndex.get(entry.target.typeName);
      const field =
        object?.kind === "object"
          ? object.fields.find(({ name }) => name === entry.target.fieldName)
          : undefined;
      if (!field || field.args === undefined) {
        invalidDefinition(
          [...path, "target"],
          "A field resolver must target a reachable computed object field.",
        );
      }
      if (entry.access.kind === "document-read") {
        const { argument } = entry.access;
        if (!field.args.some(({ name }) => name === argument)) {
          invalidDefinition(
            [...path, "access", "argument"],
            "Document-read access must name one of the field arguments.",
          );
        }
      }
      addCoordinate(`${entry.target.typeName}.${entry.target.fieldName}`, path);
      continue;
    }
    if (!("typeName" in entry)) {
      invalidDefinition(
        path,
        "A typed subgraph entry has an unsupported shape.",
      );
    }
    const target = typeIndex.get(entry.typeName);
    if (entry.kind === "resolveType") {
      if (target?.kind !== "interface" && target?.kind !== "union") {
        invalidDefinition(
          [...path, "typeName"],
          "resolveType must target an interface or union.",
        );
      }
      addCoordinate(`${entry.typeName}.__resolveType`, path);
    } else {
      if (target?.kind !== "object") {
        invalidDefinition(
          [...path, "typeName"],
          "isTypeOf must target an object type.",
        );
      }
      addCoordinate(`${entry.typeName}.__isTypeOf`, path);
    }
  }
  if (definition.hasSubscriptions !== hasSubscriptions) {
    invalidDefinition(
      ["hasSubscriptions"],
      "hasSubscriptions must match the presence of subscription entries.",
    );
  }

  assertUnique(
    definition.scalars.map(({ name }) => name),
    ["scalars"],
    "Scalar reference",
  );
  const declaredCustomScalars = new Set<string>();
  definition.scalars.forEach((scalar, index) => {
    if (
      builtInScalars.has(scalar.name) ||
      scalar.implementation !== `powerhouse.catalog#${scalar.name}`
    ) {
      invalidDefinition(
        ["scalars", index],
        "Scalar references must bind a used custom scalar to its matching catalog entry.",
      );
    }
    declaredCustomScalars.add(scalar.name);
  });
  const missing = [...usedCustomScalars].filter(
    (name) => !declaredCustomScalars.has(name),
  );
  const unused = [...declaredCustomScalars].filter(
    (name) => !usedCustomScalars.has(name),
  );
  if (missing.length > 0 || unused.length > 0) {
    invalidDefinition(
      ["scalars"],
      "Scalar references must list exactly the custom scalars used by the typed schema.",
    );
  }
}

/** Copies and validates a cross-package subgraph definition at the wire boundary. */
export function normalizeSubgraphDefinition(
  value: unknown,
): SubgraphDefinitionV1 {
  let snapshot: unknown;
  try {
    snapshot = cloneJson(value as JsonValue);
  } catch {
    return invalidDefinition(
      [],
      "A subgraph definition must be plain JSON data.",
    );
  }
  const parsed = definitionSchema.safeParse(snapshot);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return invalidDefinition(
      (issue?.path ?? []).filter(
        (segment): segment is string | number =>
          typeof segment === "string" || typeof segment === "number",
      ),
      issue?.message ?? "The subgraph definition has an invalid shape.",
    );
  }

  const definition = parsed.data as SubgraphDefinitionV1;
  if (definition.schemaKind === "typed") {
    validateTypedDefinition(definition);
    buildTypedSubgraphDocument(definition);
  } else {
    const locationFree = toLocationFreeDocument(definition.document);
    if (
      canonicalJson(locationFree as unknown as JsonValue) !==
      canonicalJson(definition.document as unknown as JsonValue)
    ) {
      return invalidDefinition(
        ["document"],
        "A compatibility definition must contain a location-free GraphQL AST.",
      );
    }
  }
  return definition;
}
