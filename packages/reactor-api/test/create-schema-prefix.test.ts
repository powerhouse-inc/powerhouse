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
  EntryKind(EntryKind: EntryKind = EntryKind, text: String = "EntryKind"): EntryKind @EntryKind(EntryKind: EntryKind)
}

enum EntryKind {
  DEBIT
  CREDIT
  EntryKind
}

directive @EntryKind(EntryKind: EntryKind = EntryKind) on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

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
  EntryKind: EntryKind = EntryKind @EntryKind(EntryKind: EntryKind)
  text: String = "EntryKind"
  options: Options = { EntryKind: EntryKind, text: "EntryKind" }
}

input Options {
  EntryKind: EntryKind
  text: String
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

function build(useNewApi = true) {
  const subgraphTypeDefs = generateDocumentModelSchema(LEDGER, {
    useNewApi,
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
      "EntryKind",
    ]);
    expect(fieldNames(typeDefs, "Ledger_AddEntryInput")).toEqual([
      "from",
      "to",
      "amount",
      "kind",
      "EntryKind",
      "text",
      "options",
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

  it.each([false, true])(
    "namespaces type nodes while preserving matching data names with useNewApi: %s",
    (useNewApi) => {
      const { subgraphTypeDefs, typeDefs } = build(useNewApi);
      const definitions = parse(print(typeDefs)).definitions;
      const entry = definitions.find(
        (node) =>
          node.kind === Kind.OBJECT_TYPE_DEFINITION &&
          node.name.value === "Ledger_Entry",
      );
      const input = definitions.find(
        (node) =>
          node.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION &&
          node.name.value === "Ledger_AddEntryInput",
      );
      const enumType = definitions.find(
        (node) =>
          node.kind === Kind.ENUM_TYPE_DEFINITION &&
          node.name.value === "Ledger_EntryKind",
      );
      const directive = definitions.find(
        (node) =>
          node.kind === Kind.DIRECTIVE_DEFINITION &&
          node.name.value === "EntryKind",
      );
      if (
        entry?.kind !== Kind.OBJECT_TYPE_DEFINITION ||
        input?.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION ||
        enumType?.kind !== Kind.ENUM_TYPE_DEFINITION ||
        directive?.kind !== Kind.DIRECTIVE_DEFINITION
      ) {
        throw new Error("The namespaced collision fixture is incomplete");
      }

      const field = entry.fields?.find(
        (node) => node.name.value === "EntryKind",
      );
      expect(field === undefined ? undefined : print(field)).toBe(
        'EntryKind(EntryKind: Ledger_EntryKind = EntryKind, text: String = "EntryKind"): Ledger_EntryKind @EntryKind(EntryKind: EntryKind)',
      );
      expect(print(enumType)).toBe(
        "enum Ledger_EntryKind {\n  DEBIT\n  CREDIT\n  EntryKind\n}",
      );
      expect(print(directive)).toBe(
        "directive @EntryKind(EntryKind: Ledger_EntryKind = EntryKind) on FIELD_DEFINITION | INPUT_FIELD_DEFINITION",
      );
      expect(print(input)).toBe(
        '"""Adds an Entry. Leave kind empty to infer the type from the value."""\ninput Ledger_AddEntryInput {\n  from: String!\n  to: String!\n  amount: Int!\n  kind: Ledger_EntryKind\n  EntryKind: Ledger_EntryKind = EntryKind @EntryKind(EntryKind: EntryKind)\n  text: String = "EntryKind"\n  options: Ledger_Options = {EntryKind: EntryKind, text: "EntryKind"}\n}',
      );
      expect(fieldNames(typeDefs, "Ledger_Options")).toEqual([
        "EntryKind",
        "text",
      ]);

      const schema = createSchema([MODULE], {}, subgraphTypeDefs);
      expect(schema.getType("Ledger_EntryKind")?.toString()).toBe(
        "Ledger_EntryKind",
      );
      expect(schema.getDirective("EntryKind")?.toString()).toBe("@EntryKind");
    },
  );
});
