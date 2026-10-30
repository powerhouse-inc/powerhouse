// Decide on documents and Propose actions against a real in-process reactor;
// only the model is a test double.
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type IReactorClient,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { Experimental_DecisionModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Connection } from "../../document-models/connection/v1/module.js";
import { documentCreateAction } from "../reactor/lib/actions/document-create.js";
import { documentDispatchAction } from "../reactor/lib/actions/document-dispatch.js";
import { testSigner } from "../reactor/test-signer.js";
import { buildActionsSchema, allowedOperations } from "./lib/action-schema.js";
import { decideOnDocuments } from "./lib/actions/decide-on-documents.js";
import {
  proposeActionsAction,
  proposeForDocument,
} from "./lib/actions/propose-actions.js";
import { decideOnDocumentsAction } from "./lib/actions/decide-on-documents.js";
import { parseDocumentIds } from "./lib/documents.js";

const CONNECTION = "powerhouse/connection";

let module: InProcessReactorClientModule;
let client: IReactorClient;

beforeAll(async () => {
  module = await new ReactorClientBuilder()
    .withSigner(await testSigner("0xai"))
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        documentModelDocumentModelModule as unknown as DocumentModelModule,
        driveDocumentModelModule as unknown as DocumentModelModule,
        Connection as unknown as DocumentModelModule,
      ]),
    )
    .buildModule();
  client = module.client;
});

afterAll(() => {
  module.reactor.kill();
});

async function newConnection(name: string, connectorId = "@acme/mail#imap") {
  const created = (await documentCreateAction.run({
    propsValue: {
      documentType: CONNECTION,
      name,
      actions: JSON.stringify([
        { type: "SET_CONNECTION_NAME", input: { name } },
        { type: "SET_CONNECTOR", input: { connectorId, authType: "NONE" } },
      ]),
    },
    reactor: client,
  } as never)) as { documentId: string };
  return created.documentId;
}

// A chat model that answers each call with the next JSON value.
function answering(...answers: unknown[]) {
  return new MockLanguageModelV4({
    doGenerate: answers.map((answer) => ({
      content: [{ type: "text", text: JSON.stringify(answer) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: {
          total: 10,
          noCache: 10,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    })),
  });
}

function promptOf(model: MockLanguageModelV4, call = 0) {
  const user = model.doGenerateCalls[call].prompt.find(
    (message) => message.role === "user",
  );
  const part = (user!.content as { type: string; text: string }[])[0];
  return JSON.parse(part.text) as Record<string, unknown>;
}

describe("declarations", () => {
  it("both read the reactor and default to two minutes", () => {
    for (const action of [decideOnDocumentsAction, proposeActionsAction]) {
      expect(action.requireReactor).toBe("read");
      expect(action.defaultTimeoutSeconds).toBe(120);
    }
  });
});

describe("document pickers", () => {
  const optionsOf = (prop: unknown) =>
    (
      prop as {
        options: (
          propsValue: unknown,
          ctx: unknown,
        ) => Promise<{
          options: { label: string; value: string }[];
          placeholder?: string;
        }>;
      }
    ).options({}, { reactor: client });

  it("tells same-named documents apart and states what empty means", async () => {
    const first = await newConnection("Twin");
    const second = await newConnection("Twin");
    const required = await optionsOf(decideOnDocumentsAction.props.documents);
    const twins = required.options.filter((o) =>
      [first, second].includes(o.value),
    );
    expect(twins).toHaveLength(2);
    expect(new Set(twins.map((o) => o.label)).size).toBe(2);
    for (const twin of twins) {
      expect(twin.label).toMatch(/^Twin \(.+\) — powerhouse\/connection$/);
    }
    expect(required.placeholder).toBe("Choose documents");
    const context = await optionsOf(proposeActionsAction.props.documents);
    expect(context.placeholder).toMatch(/no context documents/);
  });
});

describe("parseDocumentIds", () => {
  it("reads lists, JSON text, separated text and references", () => {
    expect(parseDocumentIds(["a", "b", "a"])).toEqual(["a", "b"]);
    expect(parseDocumentIds('["a","b"]')).toEqual(["a", "b"]);
    expect(parseDocumentIds("a, b\nc")).toEqual(["a", "b", "c"]);
    expect(parseDocumentIds([{ documentId: "a" }, { id: "b" }])).toEqual([
      "a",
      "b",
    ]);
    expect(parseDocumentIds(undefined)).toEqual([]);
    expect(parseDocumentIds(null)).toEqual([]);
    expect(() => parseDocumentIds([42])).toThrow(/not a document id/);
  });
});

describe("decide on documents", () => {
  it("gives the model compact document views, never operations", async () => {
    const first = await newConnection("Mail");
    const second = await newConnection("Calendar", "@acme/cal#ics");
    const seen: { state?: unknown } = {};
    const model: Experimental_DecisionModel = {
      specificationVersion: "v4",
      provider: "test",
      modelId: "fixed",
      supportedQuestionTypes: ["choice", "score", "boolean"],
      doDecide: (options) => {
        seen.state = options.state;
        return Promise.resolve({
          answers: { mail: { type: "boolean", probability: 0.9 } },
          usage: { inputTokens: 30, outputTokens: 0 },
          warnings: [],
        });
      },
    };
    const result = await decideOnDocuments(model, client, {
      documents: [first, second],
      input: "Pick the mail one.",
      questions: [
        { key: "mail", type: "boolean", instructions: "Is one a mailbox?" },
      ],
    });
    expect(result).toEqual({
      answers: { mail: { type: "boolean", probability: 0.9 } },
      usage: { inputTokens: 30, outputTokens: 0 },
    });
    const state = seen.state as {
      input: string;
      documents: Record<string, unknown>[];
    };
    expect(state.input).toBe("Pick the mail one.");
    expect(state.documents).toHaveLength(2);
    expect(state.documents[0]).toMatchObject({
      id: first,
      documentType: CONNECTION,
      name: "Mail",
      state: { global: { connectorId: "@acme/mail#imap" } },
    });
    expect(state.documents[1]).toMatchObject({ id: second });
    const text = JSON.stringify(state);
    expect(text).not.toContain("operations");
    expect(text).not.toContain("signatures");
  });

  it("projects each document with the filter", async () => {
    const id = await newConnection("Filtered");
    let state: unknown;
    const model: Experimental_DecisionModel = {
      specificationVersion: "v4",
      provider: "test",
      modelId: "fixed",
      supportedQuestionTypes: ["boolean"],
      doDecide: (options) => {
        state = options.state;
        return Promise.resolve({
          answers: { ok: { type: "boolean", probability: 1 } },
          usage: { inputTokens: 1, outputTokens: 0 },
          warnings: [],
        });
      },
    };
    await decideOnDocuments(model, client, {
      documents: id,
      filter: "$.global.connectorId",
      questions: [{ key: "ok", type: "boolean", instructions: "Ok?" }],
    });
    expect(state).toEqual({
      documents: [expect.objectContaining({ state: "@acme/mail#imap" })],
    });
  });

  it("names a document it cannot read", async () => {
    await expect(
      decideOnDocuments({} as Experimental_DecisionModel, client, {
        documents: ["missing-doc"],
        questions: [{ key: "a", type: "boolean", instructions: "x" }],
      }),
    ).rejects.toThrow(/Document "missing-doc"/);
  });

  it("asks for a document when the list is cleared", async () => {
    await expect(
      decideOnDocuments({} as Experimental_DecisionModel, client, {
        documents: null,
        questions: [{ key: "a", type: "boolean", instructions: "x" }],
      }),
    ).rejects.toThrow("Choose at least one document.");
  });
});

describe("actions schema", () => {
  it("builds one strict schema from the allowed operations' inputs", () => {
    const connection = Connection as unknown as DocumentModelModule;
    const built = buildActionsSchema(
      connection,
      allowedOperations(connection, ["SET_CONNECTOR", "SET_ACCOUNT_LABEL"]),
    );
    expect(built.strict).toBe(true);
    expect(built.schema).toMatchObject({
      required: ["reason", "actions"],
      properties: {
        actions: {
          items: {
            anyOf: [
              {
                properties: {
                  type: { enum: ["SET_CONNECTOR"] },
                  input: {
                    required: ["connectorId", "authType"],
                    additionalProperties: false,
                    properties: {
                      connectorId: { type: "string" },
                      authType: {
                        type: "string",
                        enum: expect.arrayContaining([
                          "NONE",
                          "OAUTH2",
                        ]) as string[],
                      },
                    },
                  },
                },
              },
              {
                properties: {
                  type: { enum: ["SET_ACCOUNT_LABEL"] },
                  input: {
                    properties: {
                      accountLabel: {
                        anyOf: [{ type: "string" }, { type: "null" }],
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    });
  });

  it("is open, not strict, when an input takes arbitrary JSON", () => {
    const connection = Connection as unknown as DocumentModelModule;
    const all = buildActionsSchema(
      connection,
      allowedOperations(connection, []),
    );
    expect(all.strict).toBe(false);
    expect(all.operations.map((op) => op.name)).toContain("SET_NAME");
  });

  it("fails on an unknown allowed type with did-you-mean", () => {
    expect(() =>
      allowedOperations(Connection as unknown as DocumentModelModule, [
        "SET_CONECTOR",
      ]),
    ).toThrow(/SET_CONNECTOR/);
  });
});

describe("propose actions", () => {
  it("sends the document view and returns actions Dispatch actions applies", async () => {
    const id = await newConnection("Inbox");
    const model = answering({
      reason: "Rename and label it.",
      actions: [
        { type: "SET_CONNECTION_NAME", input: { name: "Support inbox" } },
        { type: "SET_ACCOUNT_LABEL", input: { accountLabel: "support@" } },
      ],
    });
    const proposal = await proposeForDocument(model, client, {
      documentId: id,
      instruction: "Call it the support inbox, labelled support@.",
      allowedActionTypes: ["SET_CONNECTION_NAME", "SET_ACCOUNT_LABEL"],
    });
    expect(proposal).toEqual({
      documentId: id,
      reason: "Rename and label it.",
      actions: [
        {
          type: "SET_CONNECTION_NAME",
          input: { name: "Support inbox" },
          scope: "global",
        },
        {
          type: "SET_ACCOUNT_LABEL",
          input: { accountLabel: "support@" },
          scope: "global",
        },
      ],
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const prompt = promptOf(model);
    expect(prompt.instruction).toMatch(/support inbox/);
    expect(prompt.document).toMatchObject({
      id,
      name: "Inbox",
      state: { global: { connectorId: "@acme/mail#imap" } },
    });
    expect(JSON.stringify(prompt)).not.toContain("operations");
    expect(model.doGenerateCalls[0].responseFormat).toMatchObject({
      type: "json",
      schema: { required: ["reason", "actions"] },
    });

    // The whole output, as an expression would pass it.
    await documentDispatchAction.run({
      propsValue: {
        documentId: id,
        actions: proposal,
        allowedActions: "SET_CONNECTION_NAME,SET_ACCOUNT_LABEL",
      },
      reactor: client,
    } as never);
    const stored = await client.get(id);
    expect(stored.state).toMatchObject({
      global: { name: "Support inbox", accountLabel: "support@" },
    });
  });

  it("returns an empty list for nothing to do", async () => {
    const id = await newConnection("Idle");
    const proposal = await proposeForDocument(
      answering({ reason: "Already done.", actions: [] }),
      client,
      { documentId: id, instruction: "Name it Idle." },
    );
    expect(proposal.actions).toEqual([]);
    expect(proposal.reason).toBe("Already done.");
  });

  it("repairs once with the failures as feedback", async () => {
    const id = await newConnection("Repair");
    const model = answering(
      {
        reason: "Set the connector.",
        actions: [
          {
            type: "SET_CONNECTOR",
            input: { connectorId: "x", authType: "PASSWORD" },
          },
        ],
      },
      {
        reason: "Set the connector.",
        actions: [
          {
            type: "SET_CONNECTOR",
            input: { connectorId: "x", authType: "NONE" },
          },
        ],
      },
    );
    const proposal = await proposeForDocument(model, client, {
      documentId: id,
      instruction: "Use connector x without auth.",
      allowedActionTypes: "SET_CONNECTOR",
    });
    expect(proposal.actions).toEqual([
      {
        type: "SET_CONNECTOR",
        input: { connectorId: "x", authType: "NONE" },
        scope: "global",
      },
    ]);
    expect(proposal.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
    const retry = model.doGenerateCalls[1].prompt;
    const feedback = retry.at(-1)?.content as { text: string }[];
    expect(feedback[0].text).toMatch(/\[0\] SET_CONNECTOR: authType/);
    expect(retry.some((message) => message.role === "assistant")).toBe(true);
  });

  it("refuses actions outside the allowed list, then fails after one retry", async () => {
    const id = await newConnection("Guarded");
    const wrong = {
      reason: "Rename.",
      actions: [{ type: "SET_CONNECTION_NAME", input: { name: "No" } }],
    };
    const model = answering(wrong, wrong);
    await expect(
      proposeForDocument(model, client, {
        documentId: id,
        instruction: "Rename it.",
        allowedActionTypes: ["SET_ACCOUNT_LABEL"],
      }),
    ).rejects.toThrow(
      /still invalid after one correction[\s\S]*not an allowed action type/,
    );
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("refuses UNDO, REDO and NOOP when nothing is allowed explicitly", async () => {
    const id = await newConnection("Undo");
    const wrong = {
      reason: "Undo it.",
      actions: [{ type: "UNDO", input: 1 }],
    };
    await expect(
      proposeForDocument(answering(wrong, wrong), client, {
        documentId: id,
        instruction: "Undo the last change.",
      }),
    ).rejects.toThrow(/\[0\] UNDO: not an allowed action type/);
  });

  it("refuses document-scope actions even when nothing is allowed explicitly", async () => {
    const id = await newConnection("Lifecycle");
    const wrong = {
      reason: "Delete it.",
      actions: [{ type: "DELETE_DOCUMENT", input: { documentId: id } }],
    };
    await expect(
      proposeForDocument(answering(wrong, wrong), client, {
        documentId: id,
        instruction: "Delete this.",
      }),
    ).rejects.toThrow(/document lifecycle actions are refused/);
  });
});
