// Document block output trees take their roots from the model spec.
import { defineDocumentModel, materialize, ph } from "document-model";
import { describe, expect, it } from "vitest";
import { testRuntime } from "../../test/helpers/runtime.js";
import { REACTOR_PIECE } from "./reactor-piece.js";

const block = (kind: "action" | "trigger", name: string) => ({
  pieceName: REACTOR_PIECE,
  pieceVersion: "1.0.0",
  kind,
  name,
});

const INVOICE_MODULE = {
  documentModel: {
    global: {
      name: "Invoice",
      specifications: [
        {
          version: 1,
          state: {
            global: {
              schema: `
type AddressState { street: String! }
type InvoiceState { total: Float!, billTo: AddressState }
`,
            },
          },
          modules: [
            {
              operations: [
                {
                  name: "SET_URL",
                  schema: `
input LineInput { amount: Float! }
input SetUrlInput { url: URL! }
`,
                },
              ],
            },
          ],
        },
      ],
    },
  },
};

const notes = defineDocumentModel({
  id: "acme/notes",
  name: "Notes",
  description: "",
  extension: "notes",
  version: 1,
  author: { name: "Acme" },
  scopes: {
    global: {
      schema: ph.object("NotesState", {
        fields: { title: ph.String({ required: true }) },
      }),
      initialValue: { title: "" },
    },
    local: { schema: null, initialValue: {} },
  },
});
const NOTES_MODULE = materialize(
  notes.version({
    modules: [
      notes.module("main", {
        operations: ({ global }) => ({
          setTitle: global({
            input: ph.input({
              fields: { title: ph.String({ required: true }) },
            }),
            reduce(state, input) {
              state.title = input.title;
            },
          }),
        }),
      }),
    ],
  }),
);

const MODULES: Record<string, unknown> = {
  "acme/invoice": INVOICE_MODULE,
  "acme/notes": NOTES_MODULE,
};

const service = testRuntime({
  reactorClient: {
    getDocumentModelModule: (documentType: string) =>
      documentType in MODULES
        ? Promise.resolve(MODULES[documentType])
        : Promise.reject(new Error(`No model ${documentType}`)),
  } as never,
});

describe("document block output trees", () => {
  it("roots the state at the model's state type, not the first *State", async () => {
    const tree = await service.blockOutputTree(
      block("action", "document-get"),
      {
        documentType: "acme/invoice",
      },
    );
    const state = tree.nodes.find((node) => node.name === "state");
    const global = state?.children?.find((node) => node.name === "global");

    expect(tree.source).toBe("schema");
    expect(global?.children?.map((node) => node.name)).toEqual([
      "total",
      "billTo",
    ]);
  });

  it("roots an action input at the operation's input type", async () => {
    const tree = await service.blockOutputTree(
      block("trigger", "document-event"),
      {
        documentType: "acme/invoice",
        actionType: "SET_URL",
      },
    );
    const action = tree.nodes.find((node) => node.name === "action");
    const input = action?.children?.find((node) => node.name === "input");

    expect(input?.children).toEqual([{ name: "url", type: "URL!" }]);
  });

  it.each([
    [
      "roots a code-first input at the action type it dispatches",
      "SET_TITLE",
      [{ name: "title", type: "String!" }],
    ],
    [
      "gives a code-first stored name no input; no action carries it",
      "SetTitle",
      undefined,
    ],
  ])("%s", async (_, actionType, children) => {
    const tree = await service.blockOutputTree(
      block("trigger", "document-event"),
      { documentType: "acme/notes", actionType },
    );
    const action = tree.nodes.find((node) => node.name === "action");
    const input = action?.children?.find((node) => node.name === "input");

    expect(input?.children).toEqual(children);
  });
});
