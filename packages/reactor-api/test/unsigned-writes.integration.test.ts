// A host signs no write for its callers: every caller-facing write path of a
// booted API refuses an action nobody signed for its caller, names the field,
// the caller and the fix, and applies an action its caller signed.
import {
  ChannelScheme,
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import { UNSIGNED_WRITE_ERROR_CODE } from "@powerhousedao/shared/clis/unsigned-writes";
import {
  actions as baseActions,
  generateActionId,
  toTransportAction,
  type Action,
  type ISigner,
} from "@powerhousedao/shared/document-model";
import { signFor, testSigner } from "@powerhousedao/shared/testing";
import {
  defineDocumentModel,
  materialize,
  ph,
  type DocumentModelModule,
} from "document-model";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeAndStartAPI } from "../src/server.js";

const MODEL_TYPE = "powerhouse/document-model";
const DRIVE_TYPE = "powerhouse/document-drive";

// The SDK is reactor-mcp's dependency; reactor-api does not declare it.
const sdk = createRequire(
  new URL("../../reactor-mcp/package.json", import.meta.url),
);
type ToolResult = {
  isError?: boolean;
  content?: unknown;
  structuredContent?: unknown;
};
type McpClient = {
  connect(transport: unknown): Promise<void>;
  callTool(request: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<ToolResult>;
  close(): Promise<void>;
};
const { Client } = sdk("@modelcontextprotocol/sdk/client/index.js") as {
  Client: new (info: { name: string; version: string }) => McpClient;
};
const { StreamableHTTPClientTransport } = sdk(
  "@modelcontextprotocol/sdk/client/streamableHttp.js",
) as {
  StreamableHTTPClientTransport: new (
    url: URL,
    options: { requestInit: RequestInit },
  ) => unknown;
};

/** A model of the test's own: the base models get no model subgraph. */
function counterModel(): DocumentModelModule {
  const counter = defineDocumentModel({
    id: "test/counter",
    name: "Counter",
    description: "Counts.",
    extension: "counter",
    version: 1,
    author: { name: "Powerhouse" },
    scopes: {
      global: {
        schema: ph.object("CounterState", {
          fields: { count: ph.Int({ required: true }) },
        }),
        initialValue: { count: 0 },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const counting = counter.module("counting", {
    operations: ({ global }) => ({
      increment: global({
        input: ph.input({ fields: { by: ph.Int({ required: true }) } }),
        reduce(state, input) {
          state.count += input.by;
        },
      }),
    }),
  });
  return materialize(
    counter.version({ modules: [counting] }),
  ) as unknown as DocumentModelModule;
}

type Refusal = {
  message: string;
  extensions: {
    code: string;
    reason: string;
    field: string;
    caller: { address: string; label?: string } | null;
    actions: string[];
  };
};

type GraphqlAnswer = {
  data?: Record<string, unknown> | null;
  errors?: Refusal[];
};

let dispose: (() => Promise<void>) | undefined;
let url = "";
let mcpUrl = "";
let host: ISigner;
let session: ISigner;
let createDocument: (type?: string) => Promise<string>;
let operationsOf: (id: string) => Promise<Action[]>;
let driveCount: () => Promise<number>;
let documentOf: (id: string) => Promise<unknown>;

beforeAll(async () => {
  host = await testSigner("0x00000000000000000000000000000000000000a1", {
    app: "switchboard",
  });
  session = await testSigner("0x00000000000000000000000000000000000000b2", {
    app: "host session",
  });
  const api = await initializeAndStartAPI(
    async (documentModels: DocumentModelModule[]) => ({
      module: await new ReactorClientBuilder()
        .withReactorBuilder(
          new ReactorBuilder()
            .withEventBus(new EventBus())
            .withDocumentModelSources([...documentModels, counterModel()])
            .withChannelScheme(ChannelScheme.SWITCHBOARD),
        )
        .withSigner(host)
        .buildModule(),
    }),
    {
      port: 0,
      dbPath: undefined,
      mcp: true,
      enableDocumentModelSubgraphs: true,
      // Stands in for a host session: a request with this header delegates
      // its signer to the host (F3e part 2 issues real ones).
      delegatedSigner: (context) =>
        (context as { headers?: Record<string, string> }).headers?.[
          "x-test-session"
        ]
          ? session
          : undefined,
    },
    "switchboard",
  );
  dispose = api.dispose;
  url = `http://127.0.0.1:${api.port}/graphql`;
  mcpUrl = `http://127.0.0.1:${api.port}/mcp`;
  createDocument = async (type = MODEL_TYPE) => {
    const document = await api.read.newDocument(type);
    await (
      await api.write.create(document)
    ).readable;
    return document.header.id;
  };
  operationsOf = async (id) =>
    (await api.read.getOperations(id)).results.map((op) => op.action);
  driveCount = async () =>
    (await api.read.find({ type: DRIVE_TYPE })).results.length;
  documentOf = (id) => api.read.get(id);
}, 60_000);

afterAll(async () => {
  await dispose?.();
});

async function graphql(
  query: string,
  variables: Record<string, unknown> = {},
  headers: Record<string, string> = {},
  endpoint = url,
): Promise<GraphqlAnswer> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as GraphqlAnswer;
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body;
}

/** The last operation of `type` the document holds. */
async function lastOf(id: string, type: string): Promise<Action> {
  const found = (await operationsOf(id)).filter((a) => a.type === type);
  expect(found.length).toBeGreaterThan(0);
  return found.at(-1)!;
}

function refusalOf(answer: GraphqlAnswer): Refusal {
  const refusal = answer.errors?.find(
    (error) => error.extensions?.code === UNSIGNED_WRITE_ERROR_CODE,
  );
  expect(refusal, JSON.stringify(answer.errors)).toBeDefined();
  return refusal!;
}

const RENAME = /* GraphQL */ `
  mutation ($id: String!) {
    renameDocument(documentIdOrSlug: $id, name: "renamed") {
      id
      name
    }
  }
`;

const MUTATE = /* GraphQL */ `
  mutation ($id: String!, $actions: [JSONObject!]!) {
    mutateDocument(documentIdentifier: $id, actions: $actions) {
      id
      name
    }
  }
`;

describe("a caller's write nobody signed", () => {
  it("is refused when it asks the host to build the actions", async () => {
    const id = await createDocument();
    const refusal = refusalOf(await graphql(RENAME, { id }));
    expect(refusal.extensions).toMatchObject({
      code: UNSIGNED_WRITE_ERROR_CODE,
      reason: "host-built",
      field: "Mutation.renameDocument",
      caller: null,
      actions: ["SET_NAME"],
    });
    expect(refusal.message).toContain("signs no writes for its callers");
    expect(refusal.message).toContain("ph mutate <document> SET_NAME");
    expect((await operationsOf(id)).map((a) => a.type)).not.toContain(
      "SET_NAME",
    );
  });

  it("is refused when it carries unsigned actions", async () => {
    const id = await createDocument();
    const refusal = refusalOf(
      await graphql(MUTATE, {
        id,
        actions: [toTransportAction(baseActions.setName("x"))],
      }),
    );
    expect(refusal.extensions.reason).toBe("unsigned-actions");
    expect(refusal.extensions.field).toBe("Mutation.mutateDocument");
    expect(refusal.extensions.actions).toEqual(["SET_NAME"]);
  });

  it("is refused when its key names no user", async () => {
    const id = await createDocument();
    const keyOnly = await testSigner("");
    const signed = await signFor(keyOnly, baseActions.setName("x"), id);
    const refusal = refusalOf(
      await graphql(MUTATE, { id, actions: [toTransportAction(signed)] }),
    );
    expect(refusal.extensions.reason).toBe("no-identity");
  });

  it("is refused for a create and a delete the host would build", async () => {
    const created = refusalOf(
      await graphql(/* GraphQL */ `
        mutation {
          createEmptyDocument(documentType: "${MODEL_TYPE}") {
            id
          }
        }
      `),
    );
    expect(created.extensions.field).toBe("Mutation.createEmptyDocument");
    expect(created.extensions.actions).toEqual([
      "CREATE_DOCUMENT",
      "UPGRADE_DOCUMENT",
    ]);
    const id = await createDocument();
    const deleted = refusalOf(
      await graphql(
        /* GraphQL */ `
          mutation ($id: String!) {
            deleteDocument(idOrSlug: $id)
          }
        `,
        { id },
      ),
    );
    expect(deleted.extensions).toMatchObject({
      field: "Mutation.deleteDocument",
      actions: ["DELETE_DOCUMENT"],
    });
  });

  it("is refused through a model's own mutations, and signed by a delegated session", async () => {
    const id = await createDocument("test/counter");
    const increment = /* GraphQL */ `
      mutation ($id: String!) {
        Counter {
          increment(documentIdOrSlug: $id, input: { by: 2 }) {
            id
          }
        }
      }
    `;
    const refusal = refusalOf(await graphql(increment, { id }));
    expect(refusal.extensions).toMatchObject({
      reason: "host-built",
      field: "CounterMutations.increment",
      actions: ["INCREMENT"],
    });
    expect((await operationsOf(id)).map((a) => a.type)).not.toContain(
      "INCREMENT",
    );

    const delegated = await graphql(
      increment,
      { id },
      { "x-test-session": "1" },
      `${url}/counter`,
    );
    expect(delegated.errors).toBeUndefined();
    const last = await lastOf(id, "INCREMENT");
    expect(last.context?.signer?.user?.address).toBe(session.user?.address);
  });
});

describe("a caller's write signed", () => {
  it("is applied as its caller, and read back", async () => {
    const id = await createDocument();
    const caller = await testSigner(
      "0x00000000000000000000000000000000000000c3",
    );
    const signed = await signFor(caller, baseActions.setName("mine"), id);
    const answer = await graphql(MUTATE, {
      id,
      actions: [toTransportAction(signed)],
    });
    expect(answer.errors).toBeUndefined();
    expect(answer.data?.mutateDocument).toMatchObject({ id, name: "mine" });
    const last = await lastOf(id, "SET_NAME");
    expect(last.context?.signer?.user?.address).toBe(caller.user?.address);
  });

  it("is signed by the signer a request delegated, as that session", async () => {
    const id = await createDocument();
    // The reactor subgraph's own endpoint: the gateway forwards no header of
    // the test's.
    const answer = await graphql(
      RENAME,
      { id },
      { "x-test-session": "1" },
      `${url}/r`,
    );
    expect(answer.errors).toBeUndefined();
    expect(answer.data?.renameDocument).toMatchObject({ name: "renamed" });
    const last = await lastOf(id, "SET_NAME");
    expect(last.context?.signer?.user?.address).toBe(session.user?.address);
    expect(last.context?.signer?.app?.name).toBe("host session");
  });

  it("deletes by its own DELETE_DOCUMENT", async () => {
    const id = await createDocument();
    const caller = await testSigner(
      "0x00000000000000000000000000000000000000c3",
    );
    const signedDelete = await signFor(
      caller,
      {
        id: generateActionId(),
        type: "DELETE_DOCUMENT",
        scope: "document",
        timestampUtcMs: new Date().toISOString(),
        input: { documentId: id },
      },
      id,
    );
    const answer = await graphql(
      /* GraphQL */ `
        mutation ($id: String!, $signedDelete: ActionInput!) {
          deleteDocument(idOrSlug: $id, signedDelete: $signedDelete)
        }
      `,
      { id, signedDelete: toTransportAction(signedDelete) },
    );
    expect(answer.errors).toBeUndefined();
    expect(answer.data?.deleteDocument).toBe(true);
  });
});

/** Calls MCP tools over HTTP `/mcp`, sending `headers` with every request. */
async function withMcp<T>(
  headers: Record<string, string>,
  run: (
    call: (name: string, args: Record<string, unknown>) => Promise<ToolResult>,
  ) => Promise<T>,
): Promise<T> {
  const client = new Client({ name: "unsigned-writes", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers },
    }),
  );
  try {
    return await run((name, args) =>
      client.callTool({ name, arguments: args }),
    );
  } finally {
    await client.close();
  }
}

describe("HTTP /mcp's drive tools", () => {
  it("refuse a write nobody signed for its caller, with the fix naming ph mcp", async () => {
    const before = await driveCount();
    const driveId = await createDocument(DRIVE_TYPE);
    // An anonymous caller on a host that issues host session tokens is
    // asked to sign in (401, WWW-Authenticate) before the tool runs, in the
    // refusal's words.
    for (const [tool, args] of [
      ["addDrive", { name: "Nobody's" }],
      ["deleteDrive", { documentId: driveId }],
    ] as const) {
      const response = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: tool, arguments: args },
        }),
      });
      expect(response.status, tool).toBe(401);
      expect(response.headers.get("www-authenticate")).toMatch(
        /^Bearer resource_metadata="http:\/\/127\.0\.0\.1:\d+\/\.well-known\/oauth-protected-resource\/mcp", scope="documents:write"$/,
      );
      const text = await response.text();
      expect(text).toContain("UNSIGNED_WRITE");
      expect(text).toContain(
        `\`${tool}\` from an anonymous caller over HTTP /mcp asks the host to sign`,
      );
      expect(text).toContain("`ph mcp`");
    }
    expect(await driveCount()).toBe(before + 1);
    await expect(documentOf(driveId)).resolves.toBeDefined();
  });

  it("sign as the session a request delegated to the host", async () => {
    const driveId = await withMcp({ "x-test-session": "1" }, async (call) => {
      const added = await call("addDrive", { name: "Delegated" });
      expect(added.isError, JSON.stringify(added.content)).toBeFalsy();
      return (added.structuredContent as { driveId: string }).driveId;
    });
    const written = await operationsOf(driveId);
    expect(written.map((action) => action.type)).toEqual(
      expect.arrayContaining(["SET_NAME", "SET_DRIVE_NAME"]),
    );
    for (const action of written) {
      expect(action.context?.signer?.user?.address).toBe(session.user?.address);
    }

    const deleted = await withMcp({ "x-test-session": "1" }, (call) =>
      call("deleteDrive", { documentId: driveId }),
    );
    expect(deleted.isError, JSON.stringify(deleted.content)).toBeFalsy();
    await expect(documentOf(driveId)).rejects.toThrow();
  });
});
