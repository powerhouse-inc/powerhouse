import type {
  DocumentModelGlobalState,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { type DocumentNode, Kind, parse, print } from "graphql";
import { describe, expect, it } from "vitest";
import {
  createSchema,
  generateDocumentModelSchema,
  getDocumentModelTypeDefs,
} from "../src/utils/create-schema.js";

// Descriptions and field names must survive prefixing untouched.

const GLOBAL_SCHEMA = `
"""
A ledger entry. Leave kind empty to infer the type from the value.
"""
type Entry {
  from: String!
  to: String!
  amount: Int!
  kind: EntryKind
  ports: [String!]
}

enum EntryKind {
  DEBIT
  CREDIT
}

"""
Values arrive on input ports and each Entry records one transfer.
"""
type LedgerState {
  entries: [Entry!]!
}
`;

const OPERATION_SCHEMA = `
"""
Adds an Entry. Leave kind empty to infer the type from the value.
"""
input AddEntryInput {
  from: String!
  to: String!
  amount: Int!
  kind: EntryKind
}
`;

const LEDGER = {
  id: "powerhouse/ledger",
  name: "Ledger",
  specifications: [
    {
      version: 1,
      state: {
        global: { schema: GLOBAL_SCHEMA, initialValue: "" },
        local: { schema: "", initialValue: "" },
      },
      modules: [
        {
          id: "entries",
          name: "entries",
          description: "",
          operations: [
            {
              id: "add-entry",
              name: "ADD_ENTRY",
              schema: OPERATION_SCHEMA,
              description: "",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
} as unknown as DocumentModelGlobalState;

const MODULE = {
  documentModel: { global: LEDGER },
} as unknown as DocumentModelModule;

function fieldNames(doc: DocumentNode, typeName: string): string[] {
  for (const def of parse(print(doc)).definitions) {
    if (
      (def.kind === Kind.OBJECT_TYPE_DEFINITION ||
        def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION) &&
      def.name.value === typeName
    ) {
      return def.fields?.map((f) => f.name.value) ?? [];
    }
  }
  throw new Error(`type ${typeName} not found`);
}

function build() {
  const subgraphTypeDefs = generateDocumentModelSchema(LEDGER, {
    useNewApi: true,
  });
  const typeDefs = getDocumentModelTypeDefs([MODULE], subgraphTypeDefs);
  return { subgraphTypeDefs, typeDefs, sdl: print(typeDefs) };
}

describe("type prefixing leaves fields and descriptions alone", () => {
  it("keeps field names", () => {
    const { typeDefs, sdl } = build();
    expect(sdl).not.toMatch(/Ledger_(from|to|value|ports|the)\b/);
    expect(fieldNames(typeDefs, "Ledger_Entry")).toEqual([
      "from",
      "to",
      "amount",
      "kind",
      "ports",
    ]);
    expect(fieldNames(typeDefs, "Ledger_AddEntryInput")).toEqual([
      "from",
      "to",
      "amount",
      "kind",
    ]);
  });

  it("prefixes the model's own types", () => {
    const { typeDefs, sdl } = build();
    expect(fieldNames(typeDefs, "Ledger_LedgerState")).toEqual(["entries"]);
    expect(sdl).toContain("entries: [Ledger_Entry!]!");
    expect(sdl).toContain("kind: Ledger_EntryKind");
    expect(sdl).toMatch(/enum Ledger_EntryKind\b/);
    expect(sdl).toContain("input: Ledger_AddEntryInput!");
  });

  it("leaves type names in descriptions unprefixed", () => {
    const { sdl } = build();
    expect(sdl).toContain("infer the type from the value.");
    expect(sdl).toContain(
      "Values arrive on input ports and each Entry records one transfer.",
    );
    expect(sdl).toContain("Adds an Entry.");
    expect(sdl).not.toMatch(/each Ledger_Entry|Adds an Ledger_Entry/);
  });

  it("builds a valid subgraph schema", () => {
    const { subgraphTypeDefs } = build();
    const schema = createSchema([MODULE], {}, subgraphTypeDefs);
    expect(schema.getType("Ledger_Entry")).toBeDefined();
    expect(schema.getType("Ledger_from")).toBeUndefined();
  });
});
