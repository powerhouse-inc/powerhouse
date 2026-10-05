import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelPHState,
  DocumentSpecification,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  adaptSchemaFirstDocumentModelModule,
  SCHEMA_FIRST_EXAMPLE_KEY_PREFIX,
} from "../../src/definition/tooling/adapters/schema-first-document-model-module-adapter.js";
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
    // The representable types are still recorded: consumers and the
    // agreement checker need them.
    expect(projected.types.map((type) => type.name)).toContain("TodoState");
    expect(projected.types.map((type) => type.name)).toContain("TodoItem");
    // A directive use on a field is representable and stays a directive use.
    const todoState = projected.types.find((type) => type.name === "TodoState");
    expect(
      todoState?.kind === "object" ? todoState.fields[0].directives : undefined,
    ).toStrictEqual([
      { name: "audit", arguments: [{ name: "level", value: "high" }] },
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
