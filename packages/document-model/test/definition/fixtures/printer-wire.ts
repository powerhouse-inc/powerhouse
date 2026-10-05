import type { NamedGraphQLTypeDefinition } from "@powerhousedao/shared/document-model";

/**
 * Wire-node fixtures for the printer. Built directly, not through the
 * descriptor compiler, because the printer's input vocabulary is the wire
 * shape from `@powerhousedao/shared/document-model` and both adapters print
 * through this one path.
 */

export const MULTILINE_DESCRIPTION =
  "The first line of the description.\nThe second line, which keeps its break.";

export const ESCAPED_DESCRIPTION =
  'A "quoted" phrase, a tab\there, and a trailing backslash \\';

export const PRINTER_FIXTURE: readonly NamedGraphQLTypeDefinition[] = [
  {
    kind: "enum",
    name: "Priority",
    description: MULTILINE_DESCRIPTION,
    values: [
      { name: "LOW", description: null, deprecated: null },
      { name: "MEDIUM", description: "The default.", deprecated: null },
      { name: "HIGH", description: null, deprecated: "Use MEDIUM." },
    ],
  },
  {
    kind: "interface",
    name: "Node",
    description: "Anything with an identity.",
    fields: [
      {
        key: "id",
        name: "id",
        description: null,
        deprecated: null,
        type: { kind: "scalar", name: "ID", required: true },
      },
    ],
  },
  {
    kind: "object",
    name: "Task",
    description: ESCAPED_DESCRIPTION,
    implements: ["Node"],
    fields: [
      {
        key: "id",
        name: "id",
        description: null,
        deprecated: null,
        type: { kind: "scalar", name: "ID", required: true },
      },
      {
        key: "title",
        name: "title",
        description: "The one-line summary.",
        deprecated: null,
        type: { kind: "scalar", name: "String", required: true },
      },
      {
        key: "note",
        name: "note",
        description: null,
        deprecated: "Notes moved to comments.",
        type: { kind: "scalar", name: "String", required: false },
      },
      {
        key: "priority",
        name: "priority",
        description: null,
        deprecated: null,
        type: { kind: "named", name: "Priority", required: true },
      },
      {
        key: "labels",
        name: "labels",
        description: null,
        deprecated: null,
        type: {
          kind: "list",
          required: true,
          item: { kind: "scalar", name: "String", required: true },
        },
      },
      {
        key: "optionalLabels",
        name: "optionalLabels",
        description: null,
        deprecated: null,
        type: {
          kind: "list",
          required: false,
          item: { kind: "scalar", name: "String", required: false },
        },
      },
      {
        key: "matrix",
        name: "matrix",
        description: null,
        deprecated: null,
        type: {
          kind: "list",
          required: true,
          item: {
            kind: "list",
            required: false,
            item: { kind: "scalar", name: "Int", required: true },
          },
        },
      },
      {
        key: "owner",
        name: "owner",
        description: null,
        deprecated: null,
        type: { kind: "named", name: "Person", required: false },
      },
      {
        key: "assignee",
        name: "assignee",
        description: null,
        deprecated: null,
        args: [
          {
            key: "at",
            name: "at",
            description: "As of this moment.",
            deprecated: null,
            type: { kind: "scalar", name: "DateTime", required: false },
          },
          {
            key: "fallbackPriority",
            name: "fallbackPriority",
            description: null,
            deprecated: null,
            type: { kind: "named", name: "Priority", required: false },
            defaultValue: "LOW",
          },
        ],
        type: { kind: "named", name: "Assignee", required: false },
      },
      {
        key: "audited",
        name: "audited",
        description: null,
        deprecated: null,
        type: { kind: "scalar", name: "Boolean", required: false },
        directives: [
          {
            name: "audit",
            arguments: [
              { name: "level", value: 2 },
              { name: "tags", value: ["a", "b"] },
            ],
          },
          { name: "internal", arguments: [] },
        ],
      },
    ],
  },
  {
    kind: "object",
    name: "Person",
    description: null,
    fields: [
      {
        key: "id",
        name: "id",
        description: null,
        deprecated: null,
        type: { kind: "scalar", name: "ID", required: true },
      },
    ],
  },
  {
    kind: "object",
    name: "Robot",
    description: null,
    fields: [
      {
        key: "id",
        name: "id",
        description: null,
        deprecated: null,
        type: { kind: "scalar", name: "ID", required: true },
      },
    ],
  },
  {
    kind: "union",
    name: "Assignee",
    description: "Who a task can be assigned to.",
    members: ["Person", "Robot"],
  },
  {
    kind: "input",
    name: "TaskFilterInput",
    description: null,
    unknownKeys: "preserve",
    fields: [
      {
        key: "priority",
        name: "priority",
        description: null,
        deprecated: null,
        type: { kind: "named", name: "Priority", required: false },
        defaultValue: "HIGH",
      },
      {
        key: "page",
        name: "page",
        description: null,
        deprecated: null,
        type: { kind: "named", name: "PagingInput", required: false },
        defaultValue: { size: 10, cursor: null, order: "LOW" },
      },
      {
        key: "titles",
        name: "titles",
        description: null,
        deprecated: null,
        type: {
          kind: "list",
          required: false,
          item: { kind: "scalar", name: "String", required: true },
        },
        defaultValue: ["a", "b"],
      },
      {
        key: "note",
        name: "note",
        description: null,
        deprecated: null,
        type: { kind: "scalar", name: "String", required: false },
        defaultValue: null,
      },
      {
        key: "metadata",
        name: "metadata",
        description: null,
        deprecated: null,
        type: { kind: "scalar", name: "JSONObject", required: false },
        defaultValue: { nested: { count: 1 }, flag: true },
      },
    ],
  },
  {
    kind: "input",
    name: "PagingInput",
    description: null,
    unknownKeys: "preserve",
    fields: [
      {
        key: "size",
        name: "size",
        description: null,
        deprecated: null,
        type: { kind: "scalar", name: "Int", required: true },
      },
      {
        key: "cursor",
        name: "cursor",
        description: null,
        deprecated: null,
        type: { kind: "scalar", name: "String", required: false },
      },
      {
        key: "order",
        name: "order",
        description: null,
        deprecated: null,
        type: { kind: "named", name: "Priority", required: false },
      },
    ],
  },
  {
    kind: "input",
    name: "ClearInput",
    description: null,
    unknownKeys: "preserve",
    fields: [],
  },
];

/** The scalar prelude a segment deliberately leaves out. */
export const FIXTURE_SCALAR_PRELUDE = [
  "scalar DateTime",
  "scalar JSONObject",
  "directive @audit(level: Int, tags: [String!]) on FIELD_DEFINITION",
  "directive @internal on FIELD_DEFINITION",
].join("\n");
