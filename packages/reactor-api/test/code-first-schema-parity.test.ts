import type {
  DocumentModelGlobalState,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { adaptSchemaFirstDocumentModelModule } from "document-model/tooling";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "graphql";
import { describe, expect, it } from "vitest";
import {
  createSchema,
  generateDocumentModelSchema,
} from "../src/utils/create-schema.js";
import { printSchema } from "./utils/graphql-host.js";

const GOLDENS = fileURLToPath(
  new URL("../../document-model/test/parity/goldens/", import.meta.url),
);

const ROOTS = readdirSync(GOLDENS)
  .filter((file) => file.endsWith(".definition.json"))
  .map((file) => file.replace(".definition.json", ""))
  .sort();

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(`${GOLDENS}${file}`, "utf8"));
}

function servedSchema(module: DocumentModelModule, useNewApi: boolean) {
  return printSchema(
    createSchema(
      [module],
      {},
      generateDocumentModelSchema(module, { useNewApi }),
    ),
  );
}

describe.each(ROOTS)("the %s golden", (root) => {
  const global = (
    readJson(`${root}.state.json`) as {
      global: DocumentModelGlobalState;
    }
  ).global;
  const schemaFirst = {
    documentModel: { global },
    actions: {},
  } as unknown as DocumentModelModule;
  const codeFirst = {
    ...schemaFirst,
    definition: readJson(`${root}.definition.json`),
  } as DocumentModelModule;

  it.each([false, true])(
    "serves the same schema from both paths with useNewApi: %s",
    (useNewApi) => {
      expect(servedSchema(codeFirst, useNewApi)).toBe(
        servedSchema(schemaFirst, useNewApi),
      );
    },
  );
});

describe("a retained serialization", () => {
  it("orders an operation's input types as its stored schema does", () => {
    const { global } = readJson("document-drive.state.json") as {
      global: DocumentModelGlobalState;
    };
    const definition = readJson("document-drive.definition.json") as {
      specifications: {
        modules: { operations: { name: string | null }[] }[];
      }[];
    };
    const addListenerFirst = (
      modules: { operations: { name: string | null }[] }[],
    ) => {
      const owner = modules.find((module) =>
        module.operations.some(
          (operation) => operation.name === "ADD_LISTENER",
        ),
      );
      if (owner === undefined)
        throw new Error("ADD_LISTENER is not in the golden");
      owner.operations.sort(
        (left, right) =>
          Number(right.name === "ADD_LISTENER") -
          Number(left.name === "ADD_LISTENER"),
      );
    };
    addListenerFirst(global.specifications.at(-1)!.modules);
    addListenerFirst(definition.specifications.at(-1)!.modules);
    const schemaFirst = {
      documentModel: { global },
      actions: {},
    } as unknown as DocumentModelModule;
    const codeFirst = { ...schemaFirst, definition } as DocumentModelModule;
    for (const useNewApi of [false, true]) {
      expect(servedSchema(codeFirst, useNewApi)).toBe(
        servedSchema(schemaFirst, useNewApi),
      );
    }
  });
});

type StoredModule = {
  readonly name: string;
  readonly operations: readonly {
    readonly name: string;
    readonly schema: string | null;
  }[];
};

function adaptedModel(globalSchema: string, modules: readonly StoredModule[]) {
  const { global } = readJson("extensions.state.json") as {
    global: DocumentModelGlobalState;
  };
  const specification = global.specifications.at(-1)!;
  const [moduleTemplate] = specification.modules;
  const [operationTemplate] = moduleTemplate.operations;
  specification.state.global.schema = globalSchema;
  specification.modules = modules.map((module, moduleIndex) => ({
    ...moduleTemplate,
    id: `module-${moduleIndex}`,
    name: module.name,
    operations: module.operations.map((operation, operationIndex) => ({
      ...operationTemplate,
      id: `operation-${moduleIndex}-${operationIndex}`,
      name: operation.name,
      schema: operation.schema,
    })),
  }));
  const { artifacts } = adaptSchemaFirstDocumentModelModule(
    { global },
    { specifier: "./extensions.ts" },
    { version: 1 },
  );
  const schemaFirst = {
    documentModel: { global },
    actions: {},
  } as unknown as DocumentModelModule;
  return {
    schemaFirst,
    codeFirst: {
      ...schemaFirst,
      definition: artifacts[0].definition,
    } as DocumentModelModule,
  };
}

const RETAINED_STATE = [
  "enum ExtensionsStatus {\n  OPEN\n}",
  "extend enum ExtensionsStatus {\n  CLOSED\n}",
  "type ExtensionsState {\n  title: String!\n  status: ExtensionsStatus!\n}",
].join("\n\n");
const PLAIN_STATE = [
  "enum ExtensionsStatus {\n  OPEN\n  CLOSED\n}",
  "type ExtensionsState {\n  title: String!\n  status: ExtensionsStatus!\n}",
].join("\n\n");
const SET_STATUS = "input SetStatusInput {\n  status: ExtensionsStatus!\n}";

describe.each([
  {
    layout: "a retained AST whose module declares an input first",
    state: RETAINED_STATE,
    modules: [
      {
        name: "statuses",
        operations: [{ name: "SET_STATUS", schema: SET_STATUS }],
      },
    ],
    proof: '"""Module: Statuses"""\ninput Extensions_SetStatusInput {',
  },
  {
    layout: "a retained AST with a directive named like the module's input",
    state: RETAINED_STATE,
    modules: [
      {
        name: "statuses",
        operations: [
          {
            name: "SET_STATUS",
            schema: `directive @SetStatusInput on INPUT_OBJECT\n\n${SET_STATUS}`,
          },
        ],
      },
    ],
    proof: '"""Module: Statuses"""\ndirective @SetStatusInput on INPUT_OBJECT',
  },
  {
    layout: "an operation schema that declares an enum before its input",
    state: PLAIN_STATE,
    modules: [
      {
        name: "statuses",
        operations: [
          {
            name: "SET_STATUS",
            schema: `enum Reason {\n  A\n}\n\ninput SetStatusInput {\n  status: ExtensionsStatus!\n  reason: Reason\n}`,
          },
        ],
      },
    ],
    proof: '"""Module: Statuses"""\nenum Extensions_Reason {',
  },
  {
    layout: "two modules that both declare the same enum first",
    state: PLAIN_STATE,
    modules: [
      {
        name: "statuses",
        operations: [
          {
            name: "SET_STATUS",
            schema: `enum Reason {\n  A\n}\n\ninput SetStatusInput {\n  reason: Reason\n}`,
          },
        ],
      },
      {
        name: "titles",
        operations: [
          {
            name: "SET_TITLE",
            schema: `enum Reason {\n  A\n}\n\ninput SetTitleInput {\n  reason: Reason\n}`,
          },
        ],
      },
    ],
    proof: "}\n\ninput Extensions_SetTitleInput {",
  },
  {
    layout: "a state input that an operation input reaches",
    state: `${PLAIN_STATE}\n\ninput Nested {\n  a: Int!\n}\n\ninput Loose {\n  b: Int\n}`,
    modules: [
      {
        name: "statuses",
        operations: [
          {
            name: "SET_STATUS",
            schema: "input SetStatusInput {\n  nested: Nested\n}",
          },
        ],
      },
    ],
    proof: '"""Input Types from State Schema"""\ninput Extensions_Nested {',
  },
  {
    layout: "an operation input that another operation's schema declares",
    state: PLAIN_STATE,
    modules: [
      {
        name: "statuses",
        operations: [
          { name: "SET_STATUS", schema: "input Unused {\n  y: Int\n}" },
          {
            name: "OTHER",
            schema: `${SET_STATUS}\n\ninput OtherInput {\n  x: Int!\n}`,
          },
        ],
      },
    ],
    proof: '"""Module: Statuses"""\ninput Extensions_Unused {',
  },
  {
    layout: "an operation schema that declares an object type",
    state: PLAIN_STATE,
    modules: [
      {
        name: "statuses",
        operations: [
          {
            name: "SET_STATUS",
            schema: `type StatusMeta {\n  at: String\n}\n\n${SET_STATUS}`,
          },
        ],
      },
    ],
    proof: '"""Module: Statuses"""\ntype Extensions_StatusMeta {',
  },
])("$layout", ({ state, modules, proof }) => {
  const { schemaFirst, codeFirst } = adaptedModel(state, modules);

  it.each([false, true])(
    "serves the schema-first schema with useNewApi: %s",
    (useNewApi) => {
      const structured = servedSchema(codeFirst, useNewApi);
      expect(structured).toBe(servedSchema(schemaFirst, useNewApi));
      expect(structured).toContain(proof);
    },
  );

  it("leaves the template descriptions out of another subgraph", () => {
    const foreign = printSchema(
      createSchema(
        [codeFirst],
        {},
        parse(
          "type ExtensionsQueries { hello: String }\ntype Query { hello: ExtensionsQueries }",
        ),
      ),
    );
    expect(foreign).not.toContain('"""Module:');
    expect(foreign).not.toContain('"""Input Types from State Schema"""');
  });
});

describe("an object type declared in an operation schema", () => {
  const { schemaFirst, codeFirst } = adaptedModel(PLAIN_STATE, [
    {
      name: "statuses",
      operations: [
        {
          name: "SET_STATUS",
          schema: `${SET_STATUS}\n\ntype StatusMeta {\n  at: String\n}`,
        },
      ],
    },
  ]);

  it("stays out of the initial-state input, as in the stored SDL", () => {
    const structured = servedSchema(codeFirst, true);
    expect(structured).toBe(servedSchema(schemaFirst, true));
    expect(structured).not.toContain("Extensions_StatusMetaInput");
  });
});
