// Document block output trees take their roots from the model spec.
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

const service = testRuntime({
  reactorClient: {
    getDocumentModelModule: (documentType: string) =>
      documentType === "acme/invoice"
        ? Promise.resolve(INVOICE_MODULE)
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

    expect(tree.source).toBe("schema");
    expect(state?.children?.map((node) => node.name)).toEqual([
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
});
