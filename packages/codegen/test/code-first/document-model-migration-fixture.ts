import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateDocumentModel } from "../../src/codegen/index.js";
import { loadDocumentModel } from "../../src/codegen/utils.js";
import { inProject } from "./package.js";

const sdl = (version: number) => ({
  state: `type LedgerState {
  "The ledger's title"
  title: String
  entries: [LedgerEntry!]!
  cursor: ACMECursor
  tags: [LedgerTag!]!
}

type LedgerTag {
  name: String!
  children: [LedgerTag!]!
}

type LedgerEntry {
  id: OID!
  amount: Float!${version > 1 ? "\n  note: String" : ""}
}

union ACMECursor = ACMEDateCursor | ACMENumberCursor

type ACMEDateCursor {
  at: DateTime!
}

type ACMENumberCursor {
  position: Int!
}`,
  addEntry: `input AddEntryInput {
  id: OID!
  amount: Float!${version > 1 ? "\n  note: String" : ""}
}`,
  setTitle: `input SetTitleInput {
  title: String
}`,
});

const specification = (version: number) => ({
  version,
  changeLog: version > 1 ? ["Entries have a note."] : [],
  state: {
    global: {
      schema: sdl(version).state,
      initialValue: JSON.stringify({
        title: null,
        entries: [],
        cursor: null,
        tags: [],
      }),
      examples: [],
    },
    local: { schema: "", initialValue: "", examples: [] },
  },
  modules: [
    {
      id: `entries-${version}`,
      name: "entries",
      description: "Ledger entries",
      operations: [
        {
          id: `add-entry-${version}`,
          name: "addEntry",
          description: "Adds an entry",
          schema: sdl(version).addEntry,
          template: "",
          reducer: "",
          errors: [
            {
              id: `duplicate-${version}`,
              name: "DuplicateEntryError",
              code: "DUPLICATE_ENTRY",
              description: "The id is taken",
              template: "",
            },
          ],
          examples: [],
          scope: "global",
        },
        {
          id: `set-title-${version}`,
          name: "SET_TITLE",
          description: "",
          schema: sdl(version).setTitle,
          template: "",
          reducer: "",
          errors: [],
          examples: [],
          scope: "global",
        },
      ],
    },
  ],
});

/** A two-version schema-first model with the shapes real projects use. */
export const ledgerModel = {
  id: "acme/ledger",
  name: "Ledger",
  extension: "",
  description: "A ledger of entries",
  author: { name: "Acme", website: null },
  specifications: [specification(1), specification(2)],
};

const operation = (
  name: string,
  schema: string,
  scope: "global" | "local" = "global",
) => ({
  id: name,
  name,
  description: "",
  schema,
  template: "",
  reducer: "",
  errors: [],
  examples: [],
  scope,
});

/**
 * A model with the shapes the ledger lacks: a local scope, an enum, an
 * interface, input defaults, deprecations, a union in a reference cycle, a
 * type no field names, and a second module that shares an input with the first.
 */
export const boardModel = {
  id: "acme/board",
  name: "Board",
  extension: "brd",
  description: "",
  author: { name: "Acme", website: null },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema: `type BoardState {
  title: String @deprecated(reason: "Use name")
  name: String!
  status: BoardStatus!
  root: BoardNode
  items: [BoardItem!]!
}

enum BoardStatus {
  OPEN
  CLOSED @deprecated(reason: "Archive instead")
}

interface BoardNamed {
  name: String!
}

type BoardItem implements BoardNamed {
  name: String!
  weight: Int
}

type BoardNode {
  id: OID!
  parent: BoardBranch
}

union BoardBranch = BoardNode | BoardLeaf

type BoardLeaf {
  label: String!
}

type BoardAudit {
  by: String!
}`,
          initialValue: JSON.stringify({
            title: null,
            name: "",
            status: "OPEN",
            root: null,
            items: [],
          }),
          examples: [],
        },
        local: {
          schema: "type BoardLocalState {\n  collapsed: Boolean!\n}",
          initialValue: JSON.stringify({ collapsed: false }),
          examples: [],
        },
      },
      modules: [
        {
          id: "board",
          name: "board",
          description: "",
          operations: [
            operation(
              "rename",
              'input RenameInput {\n  name: String! = "untitled"\n  status: BoardStatus = OPEN\n}',
            ),
            operation(
              "addItem",
              "input AddItemInput {\n  name: String!\n  weight: Int\n  tag: BoardTagInput\n}\n\ninput BoardTagInput {\n  label: String!\n}",
            ),
          ],
        },
        {
          id: "view",
          name: "view",
          description: "",
          operations: [
            operation(
              "toggle",
              "input ToggleInput {\n  collapsed: Boolean!\n  tag: BoardTagInput\n}",
              "local",
            ),
          ],
        },
      ],
    },
  ],
};

/** Writes the stored model and generates its schema-first code. */
export async function generateStoredModel(
  dir: string,
  model: { name: string } = ledgerModel,
) {
  const path = join(dir, `${model.name.toLowerCase()}.json`);
  writeFileSync(path, JSON.stringify(model, null, 2));
  const state = await loadDocumentModel(path);
  await inProject(dir, (project) => generateDocumentModel(state, project));
}
