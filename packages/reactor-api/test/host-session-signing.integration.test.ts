// A host session signs its user's document writes (F3e part 2): with a
// `phs_` token, per-model mutations, host-built mutations, the signed delete
// and HTTP /mcp's drive tools are signed by the session's key for its user,
// labelled as the session. Without one the host still refuses to sign.
import {
  ChannelScheme,
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import { writeCredentialRecord } from "@powerhousedao/shared/clis/credential-records";
import {
  mintHostSessionToken,
  newHostSession,
  parseHostSessionToken,
  writeHostSession,
  type HostSessionFile,
} from "@powerhousedao/shared/clis/host-sessions";
import { UNSIGNED_WRITE_ERROR_CODE } from "@powerhousedao/shared/clis/unsigned-writes";
import type { Action, ISigner } from "@powerhousedao/shared/document-model";
import { testSigner } from "@powerhousedao/shared/testing";
import { buildAndSignCredential } from "@renown/sdk/node";
import {
  defineDocumentModel,
  materialize,
  ph,
  type DocumentModelModule,
  type ILogger,
} from "document-model";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initializeAndStartAPI } from "../src/server.js";

// viem is the SDK's own dependency; reactor-api does not declare it.
type Account = {
  address: `0x${string}`;
  signTypedData(args: unknown): Promise<`0x${string}`>;
};
const { privateKeyToAccount } = createRequire(
  import.meta.resolve("@renown/sdk/node"),
)("viem/accounts") as {
  privateKeyToAccount: (key: `0x${string}`) => Account;
};

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

// A well-known Anvil dev key; never used for anything real. Renown is never
// asked: the credential's record answers the host's check.
const PERSON = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const MODEL_TYPE = "powerhouse/document-model";

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

const lines: string[] = [];
function render(message: string, replacements: unknown[]): string {
  let index = 0;
  return message.replace(/@([a-zA-Z0-9_]+)/g, (token) =>
    index < replacements.length ? String(replacements[index++]) : token,
  );
}
const logger: ILogger = {
  verbose: vi.fn(),
  debug: vi.fn(),
  info: (message: string, ...rest: unknown[]) => {
    lines.push(render(message, rest));
  },
  warn: (message: string, ...rest: unknown[]) => {
    lines.push(render(message, rest));
  },
  error: vi.fn(),
  child: () => logger,
} as unknown as ILogger;

let root: string;
let dispose: (() => Promise<void>) | undefined;
let url = "";
let mcpUrl = "";
let host: ISigner;
let session: HostSessionFile;
let token = "";
let createDocument: (type?: string) => Promise<string>;
let operationsOf: (id: string) => Promise<Action[]>;
let documentOf: (id: string) => Promise<unknown>;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "host-session-signing-"));
  // A session PERSON approved for this host, with its credential's record.
  session = newHostSession({
    label: "billing",
    clientId: "curl",
    grant: "device",
  });
  const credential = await buildAndSignCredential({
    signTypedData: (args) => PERSON.signTypedData(args),
    address: PERSON.address,
    chainId: 1,
    app: "billing",
    appId: session.did,
    expiresInDays: 30,
  });
  const minted = mintHostSessionToken(session.id);
  token = minted.token;
  const end = new Date(Date.now() + 30 * 86_400_000).toISOString();
  session = {
    ...session,
    credential: credential as HostSessionFile["credential"],
    address: PERSON.address,
    chainId: 1,
    approvedAt: new Date().toISOString(),
    expiresAt: end,
    tokens: [{ hash: minted.hash, expiresAt: end }],
  };
  writeHostSession(root, session);
  writeCredentialRecord({ dataDir: root, credential, source: "host-session" });

  host = await testSigner("0x00000000000000000000000000000000000000a1", {
    app: "switchboard",
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
      logger,
      // The store's data folder: the session, its record, the verifier's.
      auth: { stateDir: join(root, ".ph") },
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
  documentOf = (id) => api.read.get(id);
}, 60_000);

afterAll(async () => {
  await dispose?.();
  rmSync(root, { recursive: true, force: true });
});

type Answer = {
  data?: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { code?: string } }[];
};

async function graphql(
  query: string,
  variables: Record<string, unknown>,
  bearer?: string,
): Promise<Answer> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Answer;
}

/** The last operation of `type`, which the session signed for PERSON. */
async function expectSignedBySession(id: string, type: string) {
  const found = (await operationsOf(id)).filter((a) => a.type === type);
  expect(found.length, type).toBeGreaterThan(0);
  const signer = found.at(-1)!.context?.signer;
  expect(signer?.user?.address.toLowerCase()).toBe(
    PERSON.address.toLowerCase(),
  );
  expect(signer?.app?.key).toBe(session.did);
  expect(signer?.app?.name).toBe("billing");
}

const RENAME = /* GraphQL */ `
  mutation ($id: String!) {
    renameDocument(documentIdOrSlug: $id, name: "renamed") {
      id
      name
    }
  }
`;

describe("with a host session token", () => {
  it("signs a host-built mutation as the session acting for its user", async () => {
    const id = await createDocument();
    const answer = await graphql(RENAME, { id }, token);
    expect(answer.errors, JSON.stringify(answer.errors)).toBeUndefined();
    expect(answer.data?.renameDocument).toMatchObject({ name: "renamed" });
    await expectSignedBySession(id, "SET_NAME");
  });

  it("signs a model's own mutation", async () => {
    const id = await createDocument("test/counter");
    const answer = await graphql(
      /* GraphQL */ `
        mutation ($id: String!) {
          Counter {
            increment(documentIdOrSlug: $id, input: { by: 3 }) {
              id
            }
          }
        }
      `,
      { id },
      token,
    );
    expect(answer.errors, JSON.stringify(answer.errors)).toBeUndefined();
    await expectSignedBySession(id, "INCREMENT");
  });

  it("signs the delete the host builds", async () => {
    const id = await createDocument();
    const answer = await graphql(
      /* GraphQL */ `
        mutation ($id: String!) {
          deleteDocument(idOrSlug: $id)
        }
      `,
      { id },
      token,
    );
    expect(answer.errors, JSON.stringify(answer.errors)).toBeUndefined();
    await expect(documentOf(id)).rejects.toThrow();
  });

  it("signs /mcp's drive tools", async () => {
    const client = new Client({ name: "host-session", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(mcpUrl), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    try {
      const added = await client.callTool({
        name: "addDrive",
        arguments: { name: "Session's" },
      });
      expect(added.isError, JSON.stringify(added.content)).toBeFalsy();
      const { driveId } = added.structuredContent as { driveId: string };
      for (const action of await operationsOf(driveId)) {
        expect(action.context?.signer?.app?.key).toBe(session.did);
        expect(action.context?.signer?.user?.address.toLowerCase()).toBe(
          PERSON.address.toLowerCase(),
        );
      }
    } finally {
      await client.close();
    }
  });

  it("logs each write by the session's short id, never its token", () => {
    const short = session.id.slice(0, 8);
    expect(
      lines.some(
        (line) =>
          line.startsWith(`Host session ${short} "billing" for 0x`) &&
          line.includes(": Mutation.renameDocument signed SET_NAME on "),
      ),
      lines.join("\n"),
    ).toBe(true);
    const { secret } = parseHostSessionToken(token)!;
    expect(lines.some((line) => line.includes(secret))).toBe(false);
    expect(lines.some((line) => line.includes(session.id))).toBe(false);
  });
});

describe("without a host session token", () => {
  it("still refuses to sign for the caller", async () => {
    const id = await createDocument();
    const answer = await graphql(RENAME, { id });
    expect(answer.errors?.[0]?.extensions?.code).toBe(
      UNSIGNED_WRITE_ERROR_CODE,
    );
  });
});
