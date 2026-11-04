import type { InProcessReactorClientModule } from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addActionsTool,
  createDocumentTool,
  getDocumentModelSchemaTool,
  getDocumentTool,
  toMcpTool,
  type AnyToolDefinition,
} from "../src/index.js";
import { Ledger } from "./fixtures/code-first-package/document-models/ledger.js";
import { createP256Signer } from "./utils/p256-signer.js";

let reactorModule: InProcessReactorClientModule;

beforeEach(async () => {
  reactorModule = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        Ledger as unknown as DocumentModelModule,
        driveDocumentModelModule as unknown as DocumentModelModule,
      ]),
    )
    .withSigner(await createP256Signer())
    .buildModule();
});

afterEach(() => {
  reactorModule.reactor.kill();
});

async function call(tool: AnyToolDefinition, args: unknown) {
  const result = await toMcpTool(tool, {
    client: reactorModule.client,
  }).callback(args as never);
  if (result.isError) {
    throw new Error(`unexpected tool error: ${JSON.stringify(result)}`);
  }
  const text = result.content[0];
  return JSON.parse(text.type === "text" ? text.text : "") as Record<
    string,
    unknown
  >;
}

describe("getDocumentModelSchema on a code-first model", () => {
  const model = {
    type: "test/ledger",
    name: "Ledger",
    description: "A running total.",
    version: 1,
    modules: [
      {
        name: "Entries",
        operations: ["SetTitle", "AddAmount", "SetNote"],
      },
    ],
  };

  it("summarizes stored operation names, as main does", async () => {
    expect(
      await call(getDocumentModelSchemaTool, { type: "test/ledger" }),
    ).toEqual({ type: "test/ledger", model });
  });

  it("adds the structured definition on request", async () => {
    expect(
      await call(getDocumentModelSchemaTool, {
        type: "test/ledger",
        definition: true,
      }),
    ).toEqual({
      type: "test/ledger",
      model,
      definition: JSON.parse(JSON.stringify(Ledger.definition)),
    });
  });

  it("lists compact actions by stored name, as main does", async () => {
    expect(
      await call(getDocumentModelSchemaTool, {
        type: "test/ledger",
        compact: true,
      }),
    ).toEqual({
      type: "test/ledger",
      compact: {
        id: "test/ledger",
        name: "Ledger",
        version: 1,
        actions: [
          {
            type: "SetTitle",
            scope: "global",
            input: "input SetTitleInput { title: String! }",
          },
          {
            type: "AddAmount",
            scope: "global",
            input: "input AddAmountInput { amount: Int! }",
          },
          {
            type: "SetNote",
            scope: "local",
            input: "input SetNoteInput { note: String }",
          },
        ],
      },
    });
  });

  it.each(["AddAmount", "ADD_AMOUNT"])(
    "slices one operation requested as %s, with its errors",
    async (operation) => {
      expect(
        await call(getDocumentModelSchemaTool, {
          type: "test/ledger",
          operation,
        }),
      ).toEqual({
        type: "test/ledger",
        operation: {
          name: "AddAmount",
          module: "Entries",
          scope: "global",
          schema: "input AddAmountInput {\n  amount: Int!\n}\n",
          errors: [
            {
              name: "NegativeAmount",
              description: "Amounts are added, never subtracted.",
            },
          ],
        },
      });
    },
  );

  it("applies code-first action types through addActions", async () => {
    const { documentId } = (await call(createDocumentTool, {
      documentType: "test/ledger",
      name: "Q3",
    })) as { documentId: string };
    const added = await call(addActionsTool, {
      documentId,
      actions: [
        { type: "SET_TITLE", input: { title: "Q3" } },
        { type: "ADD_AMOUNT", input: { amount: 7 } },
        { type: "ADD_AMOUNT", input: { amount: -1 } },
      ],
    });
    expect(added).toMatchObject({
      success: false,
      results: [
        { index: 0, type: "SET_TITLE", scope: "global" },
        { index: 1, type: "ADD_AMOUNT", scope: "global" },
        {
          index: 2,
          type: "ADD_AMOUNT",
          scope: "global",
          error: {
            kind: "reducer-error",
            message: "NegativeAmount",
            name: "NegativeAmount",
            code: "NEGATIVE_AMOUNT",
          },
        },
      ],
    });
    expect(
      await call(addActionsTool, {
        documentId,
        actions: [{ type: "SET_NOTE", input: { note: "check" } }],
      }),
    ).toMatchObject({
      success: true,
      results: [{ index: 0, type: "SET_NOTE", scope: "local" }],
    });
    const { document } = (await call(getDocumentTool, { documentId })) as {
      document: { state: unknown };
    };
    expect(document.state).toEqual({
      global: { title: "Q3", total: 7 },
      local: { note: "check" },
    });
  });
});

describe("getDocumentModelSchema on a schema-first model", () => {
  const type = "powerhouse/document-drive";

  it("ignores a definition request", async () => {
    const requested = await call(getDocumentModelSchemaTool, {
      type,
      definition: true,
    });
    expect(Object.keys(requested)).toEqual(["type", "model"]);
    expect(requested).toEqual(await call(getDocumentModelSchemaTool, { type }));
  });
});
