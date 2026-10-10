import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelPHState,
  DocumentSpecification,
  NamedGraphQLTypeDefinition,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import type { NormalizedDocumentModelArtifact } from "../../src/definition/adapters/types.js";
import { printTypeReference } from "../../src/definition/printer.js";
import {
  adaptSchemaFirstDocumentModelModule,
  SCHEMA_FIRST_EXAMPLE_KEY_PREFIX,
} from "../../src/definition/tooling/adapters/schema-first-document-model-module-adapter.js";
import { checkRetainedSerialization } from "../../src/definition/tooling/retained-serialization.js";
import { CORPUS_ROOTS, readCorpusState } from "./corpus.js";

const SOURCE = { specifier: "./models/probe.js" } as const;

function adapt(value: unknown, version?: number) {
  return adaptSchemaFirstDocumentModelModule(
    value,
    SOURCE,
    version === undefined ? {} : { version },
  );
}

/** A stored state with one operation patched, for the negative cases. */
function withOperation(
  state: DocumentModelPHState,
  patch: Record<string, unknown>,
): DocumentModelPHState {
  const clone = structuredClone(state);
  const operation = clone.global.specifications[0].modules[0].operations[0];
  Object.assign(operation, patch);
  return clone;
}

function storedTodo(
  global: { readonly schema: string; readonly initialValue: string },
  operations: Readonly<Record<string, string>>,
): DocumentModelPHState {
  const state = structuredClone(readCorpusState(CORPUS_ROOTS[7]));
  const [specification] = state.global.specifications;
  specification.state.global = { ...global, examples: [] };
  specification.state.local = { schema: "", initialValue: "", examples: [] };
  specification.modules = [
    {
      id: "ops",
      name: "ops",
      description: "",
      operations: Object.entries(operations).map(([name, schema]) => ({
        id: name,
        name,
        description: "",
        scope: "global",
        schema,
        errors: [],
        examples: [],
        template: "",
        reducer: "",
      })),
    },
  ];
  return state;
}

function declaredShapes(
  artifact: NormalizedDocumentModelArtifact,
): Record<string, readonly string[]> {
  const [specification] = artifact.definition.specifications;
  const types: NamedGraphQLTypeDefinition[] = [
    ...specification.types,
    ...specification.modules.flatMap((module) =>
      module.operations.flatMap((operation) =>
        operation.input === null ? [] : [operation.input],
      ),
    ),
  ];
  return Object.fromEntries(
    types.map((type) => [
      type.name,
      type.kind === "enum"
        ? type.values.map((value) => value.name)
        : type.kind === "union"
          ? type.members
          : type.fields.map(
              (field) =>
                `${field.name}: ${printTypeReference(field.type)}${
                  "defaultValue" in field
                    ? ` = ${JSON.stringify(field.defaultValue)}`
                    : ""
                }${(field.directives ?? []).map(({ name }) => ` @${name}`).join("")}`,
            ),
    ]),
  );
}

describe("schema-first module adapter", () => {
  describe.each(CORPUS_ROOTS)("$name", (root) => {
    const state = readCorpusState(root);

    it.each(root.versions)("normalizes version %i", (version) => {
      const result = adapt(state, version);
      expect(
        result.diagnostics.filter((entry) => entry.severity === "error"),
      ).toStrictEqual([]);
      expect(result.artifacts).toHaveLength(1);
      const [artifact] = result.artifacts;
      expect(artifact.documentType).toBe(state.global.id);
      expect(artifact.version).toBe(version);
      // The complete stored history is carried, in its stored order.
      expect(
        artifact.definition.specifications.map((entry) => entry.version),
      ).toStrictEqual(
        state.global.specifications.map((entry) => entry.version),
      );
    });

    it("preserves every stored name, id, and metadata string", () => {
      const [artifact] = adapt(state).artifacts;
      artifact.definition.specifications.forEach((specification, index) => {
        const stored = state.global.specifications[
          index
        ] as DocumentSpecification;
        specification.modules.forEach((module, moduleIndex) => {
          const storedModule = stored.modules[moduleIndex];
          expect(module.id).toBe(storedModule.id);
          expect(module.name).toBe(storedModule.name);
          expect(module.description).toBe(storedModule.description);
          module.operations.forEach((operation, operationIndex) => {
            const storedOperation = storedModule.operations[operationIndex];
            expect(operation.id).toBe(storedOperation.id);
            expect(operation.name).toBe(storedOperation.name);
            expect(operation.description).toBe(storedOperation.description);
            expect(operation.template).toBe(storedOperation.template);
            expect(operation.reducer).toBe(storedOperation.reducer);
            expect(operation.scope).toBe(storedOperation.scope);
            operation.errors.forEach((error, errorIndex) => {
              const storedError = storedOperation.errors[errorIndex];
              expect(error.id).toBe(storedError.id);
              expect(error.code).toBe(storedError.code);
              expect(error.name).toBe(storedError.name);
              expect(error.description).toBe(storedError.description);
              expect(error.template).toBe(storedError.template);
            });
          });
        });
        // The stored strings are retained exactly.
        expect(specification.state.global.materialized.schema).toBe(
          stored.state.global.schema,
        );
        expect(specification.state.global.materialized.initialValue).toBe(
          stored.state.global.initialValue,
        );
        expect(specification.state.local.materialized.initialValue).toBe(
          stored.state.local.initialValue,
        );
        expect(specification.changeLog).toStrictEqual(stored.changeLog);
      });
    });

    it("derives the action type and creator key from the stored name", () => {
      const [artifact] = adapt(state).artifacts;
      for (const specification of artifact.definition.specifications) {
        for (const module of specification.modules) {
          for (const operation of module.operations) {
            const storedName = operation.name as string;
            expect(operation.actionType).toBe(storedName);
            // Every corpus operation is stored in CONSTANT_CASE, so its
            // action type is the stored name unchanged.
            expect(operation.creatorKey).toBe(operation.key);
            expect(operation.input?.name).toBe(
              `${storedName
                .split("_")
                .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
                .join("")}Input`,
            );
          }
        }
      }
    });

    it("keys every example by its stored ID", () => {
      const [artifact] = adapt(state).artifacts;
      for (const specification of artifact.definition.specifications) {
        const examples = [
          ...specification.state.global.examples,
          ...specification.state.local.examples,
          ...specification.modules.flatMap((module) =>
            module.operations.flatMap((operation) => operation.examples),
          ),
        ];
        for (const example of examples) {
          expect(example.key).toBe(
            `${SCHEMA_FIRST_EXAMPLE_KEY_PREFIX}${example.id}`,
          );
        }
      }
    });

    it("records the state roots and resolves every scalar", () => {
      const [artifact] = adapt(state).artifacts;
      for (const specification of artifact.definition.specifications) {
        const names = specification.types.map((type) => type.name);
        expect(names).toContain(specification.state.global.root.name);
        // The global root is emitted first: the traversal starts there.
        expect(names[0]).toBe(specification.state.global.root.name);
        if (specification.state.local.root !== null) {
          expect(names).toContain(specification.state.local.root.name);
        }
        for (const scalar of specification.scalars) {
          expect(scalar.implementation).toBe(
            `powerhouse.catalog#${scalar.name}`,
          );
        }
      }
    });
  });

  it("reads a module and its stored state the same way", () => {
    const fromModule = adapt(driveDocumentModelModule);
    const fromState = adapt(driveDocumentModelModule.documentModel);
    expect(fromModule.diagnostics).toStrictEqual(fromState.diagnostics);
    expect(fromModule.artifacts).toStrictEqual(fromState.artifacts);
  });

  it("refuses the shipped drive module, whose initial values are encoded twice", () => {
    // `packages/shared/document-drive/gen/document-model.ts` stores
    // '"{\"name\":\"\",...}"' — a JSON string holding a JSON string. It
    // parses to a string, not to the object `DocumentDriveState` describes,
    // so the compiler could never produce it and the adapter must not claim
    // the two approaches are equivalent. The authored
    // `document-drive.json`, which the parity corpus reads and `ph generate`
    // consumes, stores it once and normalizes cleanly.
    const result = adapt(driveDocumentModelModule);
    expect(result.artifacts).toStrictEqual([]);
    expect(
      result.diagnostics.map((entry) => [entry.code, entry.path.join("/")]),
    ).toStrictEqual([
      [
        "PH-DM-INITIAL-VALUE-INVALID",
        "specifications/0/state/global/initialValue",
      ],
      [
        "PH-DM-INITIAL-VALUE-INVALID",
        "specifications/0/state/local/initialValue",
      ],
    ]);
  });

  it("keeps the registry default when a module omits its version", () => {
    const [artifact] = adapt(readCorpusState(CORPUS_ROOTS[0])).artifacts;
    expect(artifact.version).toBe(1);
  });

  it("retains the stored serialization when printing cannot reproduce it", () => {
    const [artifact] = adapt(readCorpusState(CORPUS_ROOTS[0])).artifacts;
    // Every corpus model is hand-formatted, so the mode is explicit.
    expect(artifact.definition.compatibility.serialization).toBe(
      "explicit-schema-first",
    );
    expect(artifact.definition.compatibility.identity).toBe(
      "explicit-schema-first",
    );
    // A difference in serialization does not enable the AST projection.
    for (const specification of artifact.definition.specifications) {
      expect(specification.graphQLCompatibility).toBeNull();
    }
  });

  it("needs no override when the stored SDL is already canonical", () => {
    const state = structuredClone(readCorpusState(CORPUS_ROOTS[7]));
    const specification = state.global.specifications[0];
    specification.state.global.schema =
      "type TodoState {\n  todos: [TodoItem!]!\n}\n\ntype TodoItem {\n  id: String!\n  title: String!\n  completed: Boolean!\n}\n";
    specification.state.local.schema = "";
    specification.state.local.initialValue = "{}";
    specification.modules[0].operations =
      specification.modules[0].operations.map((operation) => ({
        ...operation,
        schema: `input ${(operation.name as string)
          .split("_")
          .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
          .join("")}Input {\n  id: String!\n}\n`,
      }));
    const [artifact] = adapt(state).artifacts;
    expect(artifact.definition.compatibility.serialization).toBe(
      "canonical-v1",
    );
  });

  it("needs no override when an operation input defaults to an enum value", () => {
    const state = structuredClone(readCorpusState(CORPUS_ROOTS[7]));
    const specification = state.global.specifications[0];
    specification.state.global.schema =
      "type TodoState {\n  todos: [TodoItem!]!\n}\n\ntype TodoItem {\n  id: String!\n  title: String!\n  completed: Boolean!\n}\n\nenum Priority {\n  LOW\n  HIGH\n}\n";
    specification.state.local.schema = "";
    specification.state.local.initialValue = "{}";
    specification.modules[0].operations =
      specification.modules[0].operations.map((operation) => ({
        ...operation,
        schema: `input ${(operation.name as string)
          .split("_")
          .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
          .join("")}Input {\n  id: String!\n  priority: Priority! = LOW\n}\n`,
      }));
    const [artifact] = adapt(state).artifacts;
    expect(artifact.definition.compatibility.serialization).toBe(
      "canonical-v1",
    );
  });

  it("retains a pretty-printed initial value as a serialization difference", () => {
    const state = structuredClone(readCorpusState(CORPUS_ROOTS[7]));
    const specification = state.global.specifications[0];
    specification.state.global.schema =
      "type TodoState {\n  todos: [TodoItem!]!\n}\n\ntype TodoItem {\n  id: String!\n  title: String!\n  completed: Boolean!\n}\n";
    specification.state.local.schema = "";
    specification.state.local.initialValue = "{}";
    specification.modules[0].operations =
      specification.modules[0].operations.map((operation) => ({
        ...operation,
        schema: `input ${(operation.name as string)
          .split("_")
          .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
          .join("")}Input {\n  id: String!\n}\n`,
      }));
    // Every SDL segment is canonical; only the initial value is not.
    specification.state.global.initialValue = '{\n  "todos": []\n}';
    const [artifact] = adapt(state).artifacts;
    expect(artifact.definition.compatibility.serialization).toBe(
      "explicit-schema-first",
    );
  });

  it("retains an operation segment whose definition order differs", () => {
    const state = structuredClone(readCorpusState(CORPUS_ROOTS[7]));
    const specification = state.global.specifications[0];
    specification.state.global.schema =
      "type TodoState {\n  todos: [TodoItem!]!\n}\n\ntype TodoItem {\n  id: String!\n  title: String!\n  completed: Boolean!\n}\n";
    specification.state.local.schema = "";
    specification.state.local.initialValue = "{}";
    specification.state.global.initialValue = '{"todos":[]}';
    specification.modules[0].operations = [
      {
        ...specification.modules[0].operations[0],
        // A supporting input before the operation's own, which is how the
        // corpus stores one and the reverse of what the compiler prints.
        schema:
          "input HelperInput {\n  a: String\n}\n\ninput AddTodoInput {\n  helper: HelperInput\n}\n",
      },
    ];
    const [artifact] = adapt(state).artifacts;
    expect(artifact.definition.compatibility.serialization).toBe(
      "explicit-schema-first",
    );
  });

  it("projects the complete AST when the SDL leaves the descriptor grammar", () => {
    const state = structuredClone(readCorpusState(CORPUS_ROOTS[7]));
    const specification = state.global.specifications[0];
    specification.state.global.schema = [
      "directive @audit(level: String!) on FIELD_DEFINITION",
      "",
      "type TodoState {",
      '  todos: [TodoItem!]! @audit(level: "high")',
      "}",
      "",
      "type TodoItem {",
      "  id: String!",
      "  title: String!",
      "  completed: Boolean!",
      "}",
      "",
      "extend type TodoItem {",
      "  archived: Boolean",
      "}",
      "",
      "schema { query: Query }",
    ].join("\n");
    const [artifact] = adapt(state).artifacts;
    const projected = artifact.definition.specifications[0];
    expect(projected.graphQLCompatibility).not.toBeNull();
    expect(projected.graphQLCompatibility?.kind).toBe("graphql-ast-v1");
    // Every definition survives, in source order.
    expect(
      projected.graphQLCompatibility?.document.definitions.map(
        (node) => node.kind,
      ),
    ).toStrictEqual([
      "DirectiveDefinition",
      "ObjectTypeDefinition",
      "ObjectTypeDefinition",
      "ObjectTypeExtension",
      "SchemaDefinition",
      "InputObjectTypeDefinition",
      "InputObjectTypeDefinition",
      "InputObjectTypeDefinition",
    ]);
    expect(projected.types.map((type) => type.name)).toContain("TodoState");
    const todoItem = projected.types.find((type) => type.name === "TodoItem");
    expect(
      todoItem?.kind === "object"
        ? todoItem.fields.map((field) => field.name)
        : undefined,
    ).toStrictEqual(["id", "title", "completed", "archived"]);
    // A directive use on a field is representable and stays a directive use.
    const todoState = projected.types.find((type) => type.name === "TodoState");
    expect(
      todoState?.kind === "object" ? todoState.fields[0].directives : undefined,
    ).toStrictEqual([
      { name: "audit", arguments: [{ name: "level", value: "high" }] },
    ]);
  });

  it("composes a state type an operation segment extends", () => {
    const state = structuredClone(readCorpusState(CORPUS_ROOTS[7]));
    const operation = state.global.specifications[0].modules[0].operations[0];
    operation.schema = [
      operation.schema,
      "",
      "extend type TodoItem {",
      "  archived: Boolean",
      "  legacy: String @deprecated",
      "}",
    ].join("\n");
    const result = adapt(state);
    expect(result.diagnostics).toStrictEqual([]);
    const [artifact] = result.artifacts;
    const specification = artifact.definition.specifications[0];
    const todoItem = specification.types.find(
      (type) => type.name === "TodoItem",
    );
    expect(
      todoItem?.kind === "object"
        ? todoItem.fields.map(({ name, deprecated }) => [name, deprecated])
        : undefined,
    ).toStrictEqual([
      ["id", null],
      ["title", null],
      ["completed", null],
      ["archived", null],
      ["legacy", "No longer supported"],
    ]);
    expect(artifact.documentModel.global.specifications[0]).toStrictEqual(
      state.global.specifications[0],
    );
    expect(checkRetainedSerialization(artifact)).toStrictEqual([]);
  });

  it("keeps an extension's fields on an input that two operations repeat", () => {
    const state = structuredClone(readCorpusState(CORPUS_ROOTS[7]));
    const [add, remove] = state.global.specifications[0].modules[0].operations;
    add.schema = [
      "input AddTodoInput {",
      "  id: String!",
      "  title: String!",
      "  completed: Boolean!",
      "  meta: TodoMeta",
      "}",
      "input TodoMeta { tag: String }",
    ].join("\n");
    remove.schema = [
      "input RemoveTodoInput {",
      "  id: String!",
      "  meta: TodoMeta",
      "}",
      "input TodoMeta { tag: String }",
      "extend input TodoMeta { rank: Int }",
    ].join("\n");
    const result = adapt(state);
    expect(result.diagnostics).toStrictEqual([]);
    const todoMeta =
      result.artifacts[0].definition.specifications[0].types.find(
        (type) => type.name === "TodoMeta",
      );
    expect(
      todoMeta?.kind === "input"
        ? todoMeta.fields.map((field) => field.name)
        : undefined,
    ).toStrictEqual(["tag", "rank"]);
  });

  describe("a type stored outside the segment the printer would put it in", () => {
    const counter = {
      schema: "type TodoState { x: Int! }",
      initialValue: '{"x":1}',
    };

    it("finds an operation's input in another operation's schema", () => {
      const result = adapt(
        storedTodo(counter, {
          SET_X: "input Unused { y: Int }",
          OTHER:
            "input SetXInput { base: String! }\ninput OtherInput { x: Int! }",
        }),
      );
      expect(result.diagnostics).toStrictEqual([]);
      const [artifact] = result.artifacts;
      expect(checkRetainedSerialization(artifact)).toStrictEqual([]);
      expect(declaredShapes(artifact)).toStrictEqual({
        TodoState: ["x: Int!"],
        Unused: ["y: Int"],
        SetXInput: ["base: String!"],
        OtherInput: ["x: Int!"],
      });
    });

    it("names an operation input no stored segment defines", () => {
      const result = adapt(
        storedTodo(counter, { SET_X: "input SetInput { y: Int }" }),
      );
      expect(result.artifacts).toStrictEqual([]);
      expect(
        result.diagnostics.map(({ code, message, received, repair }) => ({
          code,
          message,
          received,
          repair,
        })),
      ).toStrictEqual([
        {
          code: "PH-DM-DECLARATION-INVALID",
          message:
            'No stored schema defines SetXInput, the input type of operation "SET_X".',
          received: "SetInput",
          repair:
            "Declare input SetXInput in the operation's schema, or rename its input to SetXInput; codegen and the host both look the input up by the name derived from the operation.",
        },
      ]);
    });

    it("reads a state enum an operation segment declares", () => {
      const result = adapt(
        storedTodo(
          { schema: "type TodoState { e: E! }", initialValue: '{"e":"OPEN"}' },
          { SET_X: "enum E { OPEN }\ninput SetXInput { x: Int! }" },
        ),
      );
      expect(result.diagnostics).toStrictEqual([]);
      const [artifact] = result.artifacts;
      expect(checkRetainedSerialization(artifact)).toStrictEqual([]);
      expect(declaredShapes(artifact)).toStrictEqual({
        TodoState: ["e: E!"],
        E: ["OPEN"],
        SetXInput: ["x: Int!"],
      });
    });

    it("accepts an input two operations declare identically", () => {
      const result = adapt(
        storedTodo(counter, {
          FIRST: "input Shared { a: Int! }\ninput FirstInput { s: Shared! }",
          SECOND: "input Shared { a: Int! }\ninput SecondInput { s: Shared! }",
        }),
      );
      expect(result.diagnostics).toStrictEqual([]);
      const [artifact] = result.artifacts;
      expect(checkRetainedSerialization(artifact)).toStrictEqual([]);
      expect(declaredShapes(artifact)).toStrictEqual({
        TodoState: ["x: Int!"],
        Shared: ["a: Int!"],
        FirstInput: ["s: Shared!"],
        SecondInput: ["s: Shared!"],
      });
    });

    it("accepts a global input an operation input reaches", () => {
      const result = adapt(
        storedTodo(
          {
            schema: "type TodoState { x: Int! }\ninput Nested { a: Int! }",
            initialValue: '{"x":1}',
          },
          { SET_X: "input SetXInput { n: Nested! }" },
        ),
      );
      expect(result.diagnostics).toStrictEqual([]);
      const [artifact] = result.artifacts;
      expect(checkRetainedSerialization(artifact)).toStrictEqual([]);
      expect(declaredShapes(artifact)).toStrictEqual({
        TodoState: ["x: Int!"],
        Nested: ["a: Int!"],
        SetXInput: ["n: Nested!"],
      });
    });

    it.each<{
      readonly layout: string;
      readonly global: {
        readonly schema: string;
        readonly initialValue: string;
      };
      readonly operations: Readonly<Record<string, string>>;
      readonly diagnostic: object;
    }>([
      {
        layout: "an input two operations declare with different fields",
        global: counter,
        operations: {
          FIRST: "input Shared { a: Int! }\ninput FirstInput { s: Shared! }",
          SECOND: "input Shared { b: Int! }\ninput SecondInput { s: Shared! }",
        },
        diagnostic: {
          path: [
            "specifications",
            0,
            "modules",
            0,
            "operations",
            0,
            "schema",
            "Shared",
          ],
          message:
            "Shared is declared more than once in the stored schemas, and the type code generation merges from them validates differently: code generation's Shared has a, which the declaration the adapter keeps lacks.",
          repair:
            "Declare Shared once and add the rest with `extend input Shared`, or make every declaration of Shared agree.",
        },
      },
      {
        layout: "a later repeat that drops a field",
        global: counter,
        operations: {
          FIRST: "input S { a: Int! b: Int! }\ninput FirstInput { s: S! }",
          SECOND: "input S { a: Int! }\ninput SecondInput { s: S! }",
        },
        diagnostic: {
          path: [
            "specifications",
            0,
            "modules",
            0,
            "operations",
            0,
            "schema",
            "S",
          ],
          message:
            "S is declared more than once in the stored schemas, and the type code generation merges from them validates differently: code generation's S has b, which the declaration the adapter keeps lacks.",
          repair:
            "Declare S once and add the rest with `extend input S`, or make every declaration of S agree.",
        },
      },
      {
        layout: "a state type an operation declares with another field",
        global: {
          schema: "type TodoState { x: X! }\ntype X { a: Int! }",
          initialValue: '{"x":{"a":1,"b":2}}',
        },
        operations: {
          SET_X: "type X { b: Int! }\ninput SetXInput { x: Int! }",
        },
        diagnostic: {
          path: ["specifications", 0, "state", "global", "schema", "X"],
          message:
            "X is declared more than once in the stored schemas, and the type code generation merges from them validates differently: code generation's X has a, which the declaration the adapter keeps lacks.",
          repair:
            "Declare X once and add the rest with `extend type X`, or make every declaration of X agree.",
        },
      },
      {
        layout: "a later enum repeat that drops a value",
        global: {
          schema: "type TodoState { e: E! }\nenum E { OPEN CLOSED }",
          initialValue: '{"e":"OPEN"}',
        },
        operations: { SET_X: "enum E { OPEN }\ninput SetXInput { x: Int! }" },
        diagnostic: {
          path: ["specifications", 0, "state", "global", "schema", "E"],
          message:
            "E is declared more than once in the stored schemas, and the type code generation merges from them validates differently: code generation's E has CLOSED, which the declaration the adapter keeps lacks.",
          repair:
            "Declare E once and add the rest with `extend enum E`, or make every declaration of E agree.",
        },
      },
      {
        layout: "a field two repeats give different types",
        global: counter,
        operations: {
          FIRST: "input S { a: Int! }\ninput FirstInput { s: S! }",
          SECOND: "input S { a: String! }\ninput SecondInput { s: S! }",
        },
        diagnostic: {
          path: [
            "specifications",
            0,
            "modules",
            0,
            "operations",
            0,
            "schema",
            "S",
          ],
          message:
            'S is declared more than once in the stored schemas, and code generation cannot merge the declarations. Unable to merge GraphQL input type "S": Field "a" already defined with a different type. Declared as "Int", but you tried to override with "String".',
          repair:
            "Make every declaration of S agree on each member's type, or declare S once and add the rest with `extend input S`.",
        },
      },
      {
        layout: "an object and a later input that share a name",
        global: {
          schema: "type TodoState { x: Int! }\ntype S { a: Int! }",
          initialValue: '{"x":1}',
        },
        operations: { SET_X: "input S { b: Int! }\ninput SetXInput { s: S! }" },
        diagnostic: {
          path: ["specifications", 0, "state", "global", "schema", "S"],
          message:
            "S is declared more than once in the stored schemas, and the type code generation merges from them validates differently: code generation's S has a, which the declaration the adapter keeps lacks.",
          repair: "Rename one of the types; one name holds one type.",
        },
      },
    ])(
      "rejects $layout, which validates differently from code generation",
      ({ global, operations, diagnostic }) => {
        const result = adapt(storedTodo(global, operations));
        expect(result.artifacts).toStrictEqual([]);
        expect(
          result.diagnostics.map(({ code, path, message, repair }) => ({
            code,
            path,
            message,
            repair,
          })),
        ).toStrictEqual([{ code: "PH-DM-DECLARATION-INVALID", ...diagnostic }]);
      },
    );

    it("merges an input declared once and extended in another operation", () => {
      const result = adapt(
        storedTodo(counter, {
          FIRST: "input Shared { a: Int! }\ninput FirstInput { s: Shared! }",
          SECOND:
            "extend input Shared { b: Int! }\ninput SecondInput { s: Shared! }",
        }),
      );
      expect(result.diagnostics).toStrictEqual([]);
      const [artifact] = result.artifacts;
      expect(checkRetainedSerialization(artifact)).toStrictEqual([]);
      expect(declaredShapes(artifact)).toStrictEqual({
        TodoState: ["x: Int!"],
        Shared: ["a: Int!", "b: Int!"],
        FirstInput: ["s: Shared!"],
        SecondInput: ["s: Shared!"],
      });
    });

    it("reports a declared type no retained segment declares", () => {
      const [artifact] = adapt(
        storedTodo(
          { schema: "type TodoState { e: E! }", initialValue: '{"e":"OPEN"}' },
          { SET_X: "enum E { OPEN }\ninput SetXInput { x: Int! }" },
        ),
      ).artifacts;
      const edited = structuredClone(artifact.documentModel);
      edited.global.specifications[0].modules[0].operations[0].schema =
        "input SetXInput { x: Int! }";
      expect(
        checkRetainedSerialization({ ...artifact, documentModel: edited }).map(
          ({ path, message }) => ({ path, message }),
        ),
      ).toStrictEqual([
        {
          path: ["specifications", 0],
          message: "No retained segment declares E.",
        },
      ]);
    });
  });

  it("refuses a specification whose extension the host would reject", () => {
    const state = structuredClone(readCorpusState(CORPUS_ROOTS[7]));
    state.global.specifications[0].state.global.schema +=
      "\n\nextend enum TodoItem { ARCHIVED }";
    const result = adapt(state);
    expect(result.artifacts).toStrictEqual([]);
    expect(
      result.diagnostics.map(({ code, message }) => ({ code, message })),
    ).toStrictEqual([
      {
        code: "PH-DM-COMPATIBILITY-INVALID",
        message:
          "TodoItem is an object type, so it cannot be extended as an enum.",
      },
    ]);
  });

  it("reads a stored _empty input as an empty input", () => {
    const state = structuredClone(readCorpusState(CORPUS_ROOTS[7]));
    const specification = state.global.specifications[0];
    specification.modules[0].operations[0].schema =
      "input AddTodoInput {\n  _empty: Boolean\n}";
    const [artifact] = adapt(state).artifacts;
    // The generator spells an empty input this way, so the structured node
    // is the same zero-field input a code-first empty input produces.
    expect(
      artifact.definition.specifications[0].modules[0].operations[0].input,
    ).toMatchObject({ name: "AddTodoInput", fields: [] });
  });

  it("keeps a one-field input that only resembles the empty spelling", () => {
    const state = structuredClone(readCorpusState(CORPUS_ROOTS[7]));
    const specification = state.global.specifications[0];
    specification.modules[0].operations[0].schema =
      "input AddTodoInput {\n  _empty: Boolean!\n}";
    const [artifact] = adapt(state).artifacts;
    // A required member is a real field, not the empty-input marker.
    expect(
      artifact.definition.specifications[0].modules[0].operations[0].input
        ?.fields,
    ).toHaveLength(1);
  });

  it("blocks an operation whose stored name has no runtime symbol", () => {
    for (const name of [null, "", "   "]) {
      const result = adapt(
        withOperation(readCorpusState(CORPUS_ROOTS[7]), { name }),
      );
      expect(result.artifacts).toStrictEqual([]);
      const [diagnostic] = result.diagnostics;
      expect(diagnostic.code).toBe("PH-DM-DECLARATION-INVALID");
      expect(diagnostic.path).toStrictEqual([
        "specifications",
        0,
        "modules",
        0,
        "operations",
        0,
        "name",
      ]);
      // The original value is retained distinctly, not replaced.
      expect(diagnostic.received).toBe(
        name === null ? "null" : JSON.stringify(name),
      );
    }
  });

  it("preserves a stored error whose code differs from its name", () => {
    const state = structuredClone(readCorpusState(CORPUS_ROOTS[1]));
    const [operation] = state.global.specifications[0].modules[0].operations;
    operation.errors = [
      {
        id: "e-1",
        code: "NAME_TAKEN",
        name: "NameTaken",
        description: "first",
        template: null,
      },
    ];
    const [artifact] = adapt(state).artifacts;
    const [error] =
      artifact.definition.specifications[0].modules[0].operations[0].errors;
    expect(error).toStrictEqual({
      id: "e-1",
      key: "NameTaken",
      code: "NAME_TAKEN",
      name: "NameTaken",
      description: "first",
      template: null,
    });
  });

  it("keeps two operations' occurrences of one class key distinct", () => {
    const state = structuredClone(readCorpusState(CORPUS_ROOTS[1]));
    const [first, second] =
      state.global.specifications[0].modules[0].operations;
    first.errors = [
      {
        id: "e-1",
        code: "LIMIT",
        name: "LimitReached",
        description: "first",
        template: "",
      },
    ];
    second.errors = [
      {
        id: "e-2",
        code: "LIMIT",
        name: "LimitReached",
        description: "second",
        template: null,
      },
    ];
    const [artifact] = adapt(state).artifacts;
    const [module] = artifact.definition.specifications[0].modules;
    expect(module.operations[0].errors[0]).toMatchObject({
      id: "e-1",
      key: "LimitReached",
      description: "first",
      template: "",
    });
    expect(module.operations[1].errors[0]).toMatchObject({
      id: "e-2",
      key: "LimitReached",
      description: "second",
      template: null,
    });
  });

  it("blocks an error with no stored name", () => {
    const state = withOperation(readCorpusState(CORPUS_ROOTS[1]), {
      errors: [
        { id: "e-1", code: "X", name: null, description: null, template: null },
      ],
    });
    const result = adapt(state);
    expect(result.artifacts).toStrictEqual([]);
    expect(result.diagnostics[0].path).toContainEqual("errors");
  });

  it("blocks duplicate stored example IDs", () => {
    const state = withOperation(readCorpusState(CORPUS_ROOTS[7]), {
      examples: [
        { id: "same", value: "{}" },
        { id: "same", value: "{}" },
      ],
    });
    const result = adapt(state);
    expect(
      result.diagnostics.some(
        (entry) => entry.code === "PH-DM-IDENTITY-INVALID",
      ),
    ).toBe(true);
  });

  it("blocks an unresolved scalar", () => {
    const state = structuredClone(readCorpusState(CORPUS_ROOTS[7]));
    const specification = state.global.specifications[0];
    specification.state.global.schema =
      specification.state.global.schema.replace(
        "todos: [TodoItem!]!",
        "todos: [TodoItem!]!\n  tag: MysteryScalar",
      );
    const result = adapt(state);
    expect(result.artifacts).toStrictEqual([]);
    expect(result.diagnostics[0].received).toBe("MysteryScalar");
  });

  it("rejects two operations that derive one action type", () => {
    const state = structuredClone(readCorpusState(CORPUS_ROOTS[7]));
    const specification = state.global.specifications[0];
    // A second module with an operation the first one also declares: the
    // generated switch would be first-match-wins and a code-first table
    // last-write-wins, so neither approach may normalize it.
    specification.modules.push({
      ...specification.modules[0],
      id: "twin-module",
      name: "twin_operations",
      operations: [
        { ...specification.modules[0].operations[0], id: "twin-operation" },
      ],
    });
    const result = adapt(state);
    expect(result.artifacts).toStrictEqual([]);
    expect(
      result.diagnostics.some(
        (entry) => entry.code === "PH-DM-DUPLICATE-ACTION",
      ),
    ).toBe(true);
  });

  it("reports a value that is not a stored model", () => {
    for (const value of [null, 4, "model", []]) {
      const result = adapt(value);
      expect(result.artifacts).toStrictEqual([]);
      expect(result.diagnostics.length).toBeGreaterThan(0);
    }
  });
});
