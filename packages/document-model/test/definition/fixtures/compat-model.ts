import type { SchemaFirstGraphQLDocumentCompatibility } from "@powerhousedao/shared/document-model";
import { ph } from "../../../src/definition/field.js";
import { defineDocumentModel } from "../../../src/definition/model.js";

/**
 * A declaration that carries a literal location-free AST. It imports no
 * tooling helper and needs no generated file: the runtime accepts this plain
 * data directly, and the compiler checks that the descriptors agree with it.
 *
 * The AST also carries a schema definition, a directive definition, a
 * directive use, and a type extension — the type-system forms outside the V1
 * descriptor grammar, which is why this mode exists.
 */
export const COMPAT_DOCUMENT = {
  kind: "graphql-ast-v1",
  document: {
    kind: "Document",
    definitions: [
      {
        kind: "SchemaDefinition",
        directives: [],
        operationTypes: [
          {
            kind: "OperationTypeDefinition",
            operation: "query",
            type: {
              kind: "NamedType",
              name: {
                kind: "Name",
                value: "Query",
              },
            },
          },
        ],
      },
      {
        kind: "DirectiveDefinition",
        name: {
          kind: "Name",
          value: "sensitive",
        },
        arguments: [
          {
            kind: "InputValueDefinition",
            name: {
              kind: "Name",
              value: "reason",
            },
            type: {
              kind: "NamedType",
              name: {
                kind: "Name",
                value: "String",
              },
            },
            directives: [],
          },
        ],
        repeatable: false,
        locations: [
          {
            kind: "Name",
            value: "FIELD_DEFINITION",
          },
        ],
      },
      {
        kind: "ObjectTypeDefinition",
        description: {
          kind: "StringValue",
          value: "The compat state root.",
          block: false,
        },
        name: {
          kind: "Name",
          value: "CompatState",
        },
        interfaces: [],
        directives: [],
        fields: [
          {
            kind: "FieldDefinition",
            name: {
              kind: "Name",
              value: "title",
            },
            arguments: [],
            type: {
              kind: "NonNullType",
              type: {
                kind: "NamedType",
                name: {
                  kind: "Name",
                  value: "String",
                },
              },
            },
            directives: [],
          },
          {
            kind: "FieldDefinition",
            name: {
              kind: "Name",
              value: "secret",
            },
            arguments: [],
            type: {
              kind: "NamedType",
              name: {
                kind: "Name",
                value: "String",
              },
            },
            directives: [
              {
                kind: "Directive",
                name: {
                  kind: "Name",
                  value: "sensitive",
                },
                arguments: [
                  {
                    kind: "Argument",
                    name: {
                      kind: "Name",
                      value: "reason",
                    },
                    value: {
                      kind: "StringValue",
                      value: "pii",
                      block: false,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        kind: "ObjectTypeExtension",
        name: {
          kind: "Name",
          value: "CompatState",
        },
        interfaces: [],
        directives: [],
        fields: [
          {
            kind: "FieldDefinition",
            name: {
              kind: "Name",
              value: "extra",
            },
            arguments: [],
            type: {
              kind: "NamedType",
              name: {
                kind: "Name",
                value: "Int",
              },
            },
            directives: [],
          },
        ],
      },
      {
        kind: "InputObjectTypeDefinition",
        name: {
          kind: "Name",
          value: "SetTitleInput",
        },
        directives: [],
        fields: [
          {
            kind: "InputValueDefinition",
            name: {
              kind: "Name",
              value: "title",
            },
            type: {
              kind: "NonNullType",
              type: {
                kind: "NamedType",
                name: {
                  kind: "Name",
                  value: "String",
                },
              },
            },
            directives: [],
          },
        ],
      },
    ],
  },
  preserveDefinitionOrder: true,
} as SchemaFirstGraphQLDocumentCompatibility;

export const compatState = ph.object("CompatState", {
  description: "The compat state root.",
  fields: {
    title: ph.String({ required: true }),
    secret: ph.String(),
  },
});

export const compat = defineDocumentModel({
  id: "test/compat",
  name: "Compat",
  description: "",
  extension: "compat",
  version: 1,
  author: { name: "Powerhouse" },
  specifications: {
    graphQLCompatibility: COMPAT_DOCUMENT,
    global: {
      schema: compatState,
      initialValue: { title: "", secret: null },
    },
    local: { schema: null, initialValue: {} },
  },
});

export const compatModule = compat.module("titles", {
  operations: ({ global }) => ({
    setTitle: global({
      input: ph.input({ fields: { title: ph.String({ required: true }) } }),
      reduce(state, input) {
        state.title = input.title;
      },
    }),
  }),
});

export const Compat = compat.finalize({ modules: [compatModule] });
