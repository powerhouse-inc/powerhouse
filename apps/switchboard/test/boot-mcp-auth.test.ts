// /mcp on a booted Switchboard with document permissions: the official MCP
// client over HTTP and GraphQL, as callers holding real did:key bearers.
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addFolder } from "@powerhousedao/shared/document-drive";
import { MemoryKeyStorage, RenownCryptoBuilder } from "@renown/sdk/node";
import type { ILogger } from "document-model";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SwitchboardReactor } from "../src/types.js";
import { bootSwitchboard } from "./boot-helpers.js";

// The SDK is reactor-mcp's dependency; the switchboard does not declare it.
const sdk = createRequire(
  new URL("../../../packages/reactor-mcp/package.json", import.meta.url),
);
type ToolResult = {
  structuredContent?: unknown;
  isError?: boolean;
  content?: unknown;
};
type McpClient = {
  connect(transport: unknown): Promise<void>;
  listTools(): Promise<{ tools: { name: string }[] }>;
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

const ADMIN = "0x1111111111111111111111111111111111111111";
const READER = "0x2222222222222222222222222222222222222222";
const WRITER = "0x3333333333333333333333333333333333333333";
const OUTSIDER = "0x4444444444444444444444444444444444444444";
const USERS = [ADMIN, READER, WRITER, OUTSIDER] as const;
type Caller = (typeof USERS)[number] | "anonymous";
const CALLERS: Caller[] = [...USERS, "anonymous"];

const ENV_KEYS = [
  "PH_REACTOR_DATABASE_URL",
  "MCP_ENABLED",
  "FEATURE_PLUGIN_HOST_ENABLED",
  "AUTH_ENABLED",
  "ADMINS",
  "RESOLVE_CALLER_IDENTITY",
  "SKIP_CREDENTIAL_VERIFICATION",
] as const;

const logger = {
  verbose: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => logger,
} as unknown as ILogger;

// A Renown login's bearer: a JWT signed by a fresh did:key, naming `address`.
async function bearerFor(address: string): Promise<string> {
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  return crypto.getBearerToken(address);
}

let tempRoot = "";
let previous: [string, string | undefined][] = [];
let switchboard: SwitchboardReactor | undefined;
let tokens: Record<string, string> = {};
let shared = "";
let open = "";

const base = () => `http://127.0.0.1:${switchboard!.port}`;
const authorization = (caller: Caller): Record<string, string> =>
  caller === "anonymous" ? {} : { authorization: `Bearer ${tokens[caller]}` };

type GraphqlResult = {
  status: number;
  errors?: { extensions?: { code?: string } }[];
  data?: Record<string, unknown>;
};

async function graphql(
  caller: Caller,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GraphqlResult> {
  const response = await fetch(`${base()}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authorization(caller) },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as Omit<GraphqlResult, "status">;
  return { status: response.status, ...body };
}

async function graphqlOk(caller: Caller, query: string, variables = {}) {
  const result = await graphql(caller, query, variables);
  expect(result.errors, JSON.stringify(result.errors)).toBeUndefined();
  return result.data!;
}

beforeAll(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "switchboard-mcp-auth-"));
  previous = ENV_KEYS.map((name) => [name, process.env[name]]);
  for (const name of ENV_KEYS) delete process.env[name];
  process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");

  switchboard = await bootSwitchboard(
    {
      server: { port: 0 },
      storage: { readModel: { url: join(tempRoot, "read-model") } },
      features: { workflows: false, mcp: true },
      packages: { disableLocal: true },
      identity: { keypairPath: join(tempRoot, "identity.json") },
      protocol: {
        featureFlags: { documentDecisions: true, authEnforcement: true },
      },
      auth: {
        enabled: true,
        admins: [ADMIN],
        documentPermissions: { enabled: true },
        // The bearer's signature is still verified; only the Renown lookup
        // of its credential is skipped, as the boot allows under vitest.
        skipCredentialVerification: true,
        // No discovery request: every write here is the host's own.
        renown: { switchboardUrl: "http://127.0.0.1:9/graphql" },
      },
    },
    { logger },
  );

  tokens = Object.fromEntries(
    await Promise.all(
      USERS.map(
        async (address) => [address, await bearerFor(address)] as const,
      ),
    ),
  );

  const { reactor } = switchboard;
  const drive = async (name: string) => {
    const handle = await reactor.write.drives.create({ global: { name } });
    await handle.readable;
    return handle.documentId;
  };
  shared = await drive("Shared");
  open = await drive("Open");
  // The ACL GraphQL decides with, set through GraphQL by the admin.
  await graphqlOk(
    ADMIN,
    `mutation ($id: String!) { setDocumentProtection(documentIdOrSlug: $id, protected: true) { documentId } }`,
    { id: shared },
  );
  for (const [user, permission] of [
    [READER, "READ"],
    [WRITER, "WRITE"],
  ]) {
    await graphqlOk(
      ADMIN,
      `mutation ($id: String!, $user: String!, $permission: DocumentPermissionLevel!) {
        grantDocumentPermission(documentIdOrSlug: $id, userAddress: $user, permission: $permission) { documentId }
      }`,
      { id: shared, user, permission },
    );
  }
}, 60_000);

afterAll(async () => {
  await switchboard?.shutdown();
  for (const [name, value] of previous) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(tempRoot, { recursive: true, force: true });
});

async function withClient<T>(
  caller: Caller,
  run: (
    call: (name: string, args?: object) => Promise<ToolResult>,
  ) => Promise<T>,
): Promise<T> {
  const client = new Client({ name: "boot-mcp-auth", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base()}/mcp`), {
      requestInit: { headers: authorization(caller) },
    }),
  );
  try {
    return await run((name, args = {}) =>
      client.callTool({ name, arguments: args as Record<string, unknown> }),
    );
  } finally {
    await client.close();
  }
}

const forbiddenTool = (result: ToolResult) =>
  result.isError === true &&
  JSON.stringify(result.content).includes("FORBIDDEN");

const forbiddenGraphql = (result: GraphqlResult) =>
  result.errors?.some((e) => e.extensions?.code === "FORBIDDEN") ?? false;

async function postPing(header?: string): Promise<number> {
  const response = await fetch(`${base()}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(header ? { authorization: header } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });
  await response.body?.cancel();
  return response.status;
}

describe("Switchboard's /mcp authorizes as its GraphQL API does", () => {
  it("admits the callers GraphQL admits and refuses a bad bearer", async () => {
    for (const caller of CALLERS) {
      expect(await postPing(authorization(caller).authorization)).toBe(200);
    }
    expect(await postPing("Bearer not-a-jwt")).toBe(401);
    expect((await graphql(READER, "{ __typename }")).status).toBe(200);
    const bad = await fetch(`${base()}/graphql`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer not-a-jwt",
      },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    expect(bad.status).toBe(401);
  });

  it("refuses and allows each caller the same read", async () => {
    const decisions = await Promise.all(
      CALLERS.map(async (caller) => {
        const viaGraphql = await graphql(
          caller,
          `
            query ($id: String!) {
              document(idOrSlug: $id) {
                document {
                  id
                }
              }
            }
          `,
          { id: shared },
        );
        const viaMcp = await withClient(caller, (call) =>
          call("getDrive", { driveId: shared }),
        );
        return {
          caller,
          graphql: forbiddenGraphql(viaGraphql) ? "forbidden" : "allowed",
          mcp: forbiddenTool(viaMcp) ? "forbidden" : "allowed",
        };
      }),
    );

    const allowed = [ADMIN, READER, WRITER];
    for (const decision of decisions) {
      const expected = allowed.includes(decision.caller)
        ? "allowed"
        : "forbidden";
      expect(decision).toEqual({
        caller: decision.caller,
        graphql: expected,
        mcp: expected,
      });
    }
  });

  it("lists the same drives to each caller", async () => {
    for (const caller of [READER, OUTSIDER] as const) {
      const data = await graphqlOk(
        caller,
        `{ findDocuments(search: { type: "powerhouse/document-drive" }) { items { id } } }`,
      );
      const viaGraphql = (
        data.findDocuments as { items: { id: string }[] }
      ).items.map((d) => d.id);
      const viaMcp = await withClient(caller, async (call) =>
        (
          (await call("getDrives")).structuredContent as {
            drives: { id: string }[];
          }
        ).drives.map((d) => d.id),
      );
      expect(viaMcp.sort()).toEqual(viaGraphql.sort());
      expect(viaMcp.includes(shared)).toBe(caller === READER);
      expect(viaMcp).toContain(open);
    }
  });

  it("refuses and allows each caller the same write", async () => {
    for (const caller of CALLERS) {
      const folder = (via: string) => {
        const { id, type, input, scope, timestampUtcMs } = addFolder({
          id: `${via}-${caller}`,
          name: `${via}-${caller}`,
        });
        return { id, type, input, scope, timestampUtcMs };
      };
      const viaGraphql = await graphql(
        caller,
        `
          mutation ($id: String!, $actions: [ActionInput!]!) {
            execute(documentIdOrSlug: $id, actions: $actions) {
              id
            }
          }
        `,
        { id: shared, actions: [folder("graphql")] },
      );
      const { type, input } = folder("mcp");
      const viaMcp = await withClient(caller, (call) =>
        call("addActions", { documentId: shared, actions: [{ type, input }] }),
      );
      const mayWrite = caller === ADMIN || caller === WRITER;

      expect(forbiddenGraphql(viaGraphql), caller).toBe(!mayWrite);
      if (mayWrite) {
        expect(viaMcp.structuredContent, caller).toMatchObject({
          success: true,
        });
      } else if (caller !== READER) {
        // addActions reads its target first, so a non-reader is refused there.
        expect(forbiddenTool(viaMcp), caller).toBe(true);
      } else {
        expect(viaMcp.structuredContent, caller).toMatchObject({
          success: false,
          results: [{ index: 0, error: { kind: "denied" } }],
        });
      }
    }
    const drive = await switchboard!.reactor.read.get(shared);
    const nodes = (
      drive.state as unknown as { global: { nodes: { id: string }[] } }
    ).global.nodes.map((n) => n.id);
    expect(nodes.sort()).toEqual(
      [
        `graphql-${ADMIN}`,
        `graphql-${WRITER}`,
        `mcp-${ADMIN}`,
        `mcp-${WRITER}`,
      ].sort(),
    );
  });

  it("refuses and allows each caller the same creates", async () => {
    for (const caller of CALLERS) {
      const inDrive = await graphql(
        caller,
        `
          mutation ($parent: String!) {
            createEmptyDocument(
              documentType: "powerhouse/document-model"
              parentIdOrSlug: $parent
            ) {
              id
            }
          }
        `,
        { parent: shared },
      );
      const loose = await graphql(
        caller,
        `
          mutation {
            createEmptyDocument(documentType: "powerhouse/document-model") {
              id
            }
          }
        `,
      );
      const viaMcp = await withClient(caller, async (call) => ({
        inDrive: await call("createDocument", {
          documentType: "powerhouse/document-model",
          driveId: shared,
        }),
        loose: await call("createDocument", {
          documentType: "powerhouse/document-model",
        }),
      }));

      expect(viaMcp.inDrive.isError === true, caller).toBe(
        forbiddenGraphql(inDrive),
      );
      expect(viaMcp.loose.isError === true, caller).toBe(
        (loose.errors?.length ?? 0) > 0,
      );
    }
  });

  it("makes an MCP creator the owner GraphQL then lets manage the document", async () => {
    const documentId = await withClient(OUTSIDER, async (call) => {
      const created = await call("createDocument", {
        documentType: "powerhouse/document-model",
      });
      return (created.structuredContent as { documentId: string }).documentId;
    });
    const data = await graphqlOk(
      OUTSIDER,
      `mutation ($id: String!) { setDocumentProtection(documentIdOrSlug: $id, protected: true) { documentId } }`,
      { id: documentId },
    );
    expect(data.setDocumentProtection).toEqual({ documentId });
    const refused = await withClient(READER, (call) =>
      call("getDocument", { documentId }),
    );
    expect(forbiddenTool(refused)).toBe(true);
  });

  it("refuses a delete the caller may not make, as GraphQL does", async () => {
    const viaGraphql = await graphql(
      READER,
      `
        mutation ($id: String!) {
          deleteDocument(idOrSlug: $id)
        }
      `,
      { id: shared },
    );
    const viaMcp = await withClient(READER, (call) =>
      call("deleteDrive", { documentId: shared }),
    );
    expect(forbiddenGraphql(viaGraphql)).toBe(true);
    expect(forbiddenTool(viaMcp)).toBe(true);
    await expect(switchboard!.reactor.read.get(shared)).resolves.toBeDefined();
  });
});
