import type {
  DocumentModelDefinition,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { type DocumentNode, Kind, print } from "graphql";
import { describe, expect, it } from "vitest";
import {
  buildDocumentModelSchema,
  createSchema,
  generateDocumentModelSchema,
  getDocumentModelTypeDefs,
  reservedTypeNamesTaken,
  typeDefinitionNames,
} from "../src/utils/create-schema.js";
import {
  asSchemaFirst,
  asStored,
  boardModel,
  ledgerModel,
  taskFamilyModels,
  withBlankStoredSdl,
} from "./utils/code-first-models.js";
import { sortedSchema } from "./utils/document-model-host.js";

const EMPTY: DocumentNode = { kind: Kind.DOCUMENT, definitions: [] };

function withoutInput(module: DocumentModelModule, key: string) {
  const { definition } = module as DocumentModelModule & {
    definition: DocumentModelDefinition;
  };
  const spec = definition.specifications.at(-1)!;
  const stored = module.documentModel.global.specifications.at(-1)!;
  const name = spec.modules
    .flatMap((m) => m.operations)
    .find((op) => op.key === key)!.name;
  return {
    ...module,
    definition: {
      ...definition,
      specifications: [
        ...definition.specifications.slice(0, -1),
        {
          ...spec,
          modules: spec.modules.map((m) => ({
            ...m,
            operations: m.operations.map((op) =>
              op.key === key ? { ...op, input: null } : op,
            ),
          })),
        },
      ],
    },
    documentModel: {
      ...module.documentModel,
      global: {
        ...module.documentModel.global,
        specifications: [
          ...module.documentModel.global.specifications.slice(0, -1),
          {
            ...stored,
            modules: stored.modules.map((m) => ({
              ...m,
              operations: m.operations.map((op) =>
                op.name === name ? { ...op, schema: "" } : op,
              ),
            })),
          },
        ],
      },
    },
  } as DocumentModelModule;
}

const [taskV1, taskV2] = taskFamilyModels();

const MATRIX: [string, DocumentModelModule][] = [
  ["the board (every DSL shape, package scalars)", boardModel()],
  ["an operation without input", withoutInput(ledgerModel(), "clear")],
  ["family version 1", taskV1],
  ["family version 2", taskV2],
];

function served(module: DocumentModelModule) {
  const own = generateDocumentModelSchema(module, { useNewApi: true });
  return {
    legacy: print(generateDocumentModelSchema(module)),
    newApi: print(own),
    hostTypes: print(getDocumentModelTypeDefs([module], EMPTY)),
    subgraph: sortedSchema(
      createSchema([module], {}, own, {
        ownTypeNames: typeDefinitionNames(own),
      }),
    ),
  };
}

const BOARD_GENERATED = `scalar Bic

scalar Iban

type Board_BoardState {
  tasks: [Board_Task!]!
  entries: [Board_Entry!]!
  owner: Iban
}

"""
A task on the board.
It has a title.
"""
type Board_Task implements Board_Node {
  id: ID!
  "The title.\\nEnds with \\"quote\\""
  title: String!
  tags: [String!]
  priority: Board_Priority!
  legacy: String @deprecated(reason: "Use \\"title\\".")
  due: DateTime
}

"Has an \\"id\\" \\\\ key"
interface Board_Node {
  id: ID!
}

"""
How urgent a task is.
Quote "HIGH" for C:\\ paths.
"""
enum Board_Priority {
  LOW
  "Say \\"now\\""
  HIGH
  URGENT @deprecated(reason: "Use HIGH.")
}

"Either a task or a note."
union Board_Entry = Board_Task | Board_Note

type Board_Note implements Board_Node {
  id: ID!
  body: String
}

type Board_BoardLocalState {
  draft: String
  bank: Bic
}

type Board implements IDocument {
  id: String!
  name: String!
  documentType: String!
  operations(skip: Int, first: Int): [Operation!]!
  revision: Int!
  createdAtUtcIso: DateTime!
  lastModifiedAtUtcIso: DateTime!
  initialState: Board_BoardState!
  state: Board_BoardState!
  stateJSON: JSONObject
}`;

describe("a code-first model served from its definition", () => {
  it.each(MATRIX)(
    "serves %s exactly as its stored model does",
    (_name, module) => {
      const structured = served(module);
      expect(structured).toEqual(served(asStored(module)));
      expect(structured).toEqual(served(asSchemaFirst(module)));
      expect(served(withBlankStoredSdl(module))).toEqual(structured);
    },
  );

  it("prints the board's generated types from its definition", () => {
    const { generated } = buildDocumentModelSchema(boardModel());
    expect(print({ kind: Kind.DOCUMENT, definitions: generated })).toBe(
      BOARD_GENERATED,
    );
  });

  it("leaves an operation without input out of the mutations", () => {
    const schema = served(withoutInput(ledgerModel(), "clear")).newApi;
    expect(schema).toContain("addEntry(");
    expect(schema).not.toContain("clear(");
    expect(schema).not.toContain("Ledger_ClearInput");
  });

  it("cannot build the stored model when the stored SDL is blank", () => {
    const blank = withBlankStoredSdl(boardModel());
    expect(() => buildDocumentModelSchema(asStored(blank))).toThrow(
      'Unknown type "Board_BoardState".',
    );
  });

  it("checks reserved names against the definition", () => {
    const blank = withBlankStoredSdl(boardModel());
    const reserved = new Map([
      ["Board_Task", false],
      ["Board_Ghost", false],
    ]);
    expect(reservedTypeNamesTaken(blank, reserved)).toEqual(["Board_Task"]);
    expect(reservedTypeNamesTaken(asStored(blank), reserved)).toEqual([]);
  });
});
