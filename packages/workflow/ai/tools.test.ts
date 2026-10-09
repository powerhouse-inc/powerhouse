import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDriveWindow } from "../test/drive-window.js";
import { schemaFetch, type RuntimeRoot } from "../test/runtime-schema.js";
import type * as ToolsModule from "./tools.js";

const IMAP_PIECE = {
  name: "@activepieces/piece-imap",
  displayName: "IMAP",
  description: "Fetch emails from an IMAP server.",
  logoUrl: "",
  version: "1.0.0",
  actionCount: 2,
  triggerCount: 1,
  auth: {
    type: "CUSTOM_AUTH",
    displayName: "IMAP login",
    props: {
      host: { displayName: "Host", required: true },
      port: { displayName: "Port", type: "NUMBER" },
      username: { displayName: "Username", required: true },
      password: {
        displayName: "Password",
        type: "SECRET_TEXT",
        required: true,
      },
    },
  },
};

const SLACK_PIECE = {
  name: "@activepieces/piece-slack",
  displayName: "Slack",
  description: "Send messages to Slack.",
  logoUrl: "",
  version: "2.0.0",
  actionCount: 1,
  triggerCount: 1,
  auth: { type: "OAUTH2", displayName: "Slack OAuth" },
};

const entry = (name: string, displayName: string) => ({
  name,
  displayName,
  description: "",
});

// A piece's listings; only IMAP has actions and triggers.
const LISTINGS: RuntimeRoot = {
  pieceActions: ({ packageName }: { packageName: string }) => ({
    name: packageName,
    version: "1.0.0",
    actions:
      packageName === IMAP_PIECE.name
        ? [
            entry("fetchMailbox", "Fetch mailbox"),
            entry("fetchMessages", "Fetch messages"),
          ]
        : [],
  }),
  pieceTriggers: ({ packageName }: { packageName: string }) => ({
    name: packageName,
    version: "1.0.0",
    triggers:
      packageName === IMAP_PIECE.name
        ? [{ ...entry("newMessage", "New message"), strategy: "" }]
        : [],
  }),
};

// The tools' requests, executed against the real workflow-runtime schema.
function serve(root: RuntimeRoot) {
  const server = schemaFetch(root);
  vi.stubGlobal("fetch", server.fetch);
  return server;
}

function installWindow(
  client?: {
    get: (id: string) => Promise<{ state: { global?: unknown } }>;
  },
  remotes?: Record<string, string>,
): void {
  installDriveWindow({
    selectedDriveId: "drive-1",
    reactorClient: client,
    remotes,
  });
}

let tools: typeof ToolsModule;

beforeEach(async () => {
  vi.resetModules();
  tools = await import("./tools.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getConnectors", () => {
  it("returns the full plan for each catalog entry", async () => {
    serve({ pieceCatalog: [IMAP_PIECE], ...LISTINGS });

    const result = await tools.getConnectors();

    expect(result.total).toBe(1);
    expect(result.matches).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.connectors).toEqual([
      {
        connectorId: "@activepieces/piece-imap#imap",
        pieceName: IMAP_PIECE.name,
        displayName: "IMAP",
        description: "Fetch emails from an IMAP server.",
        version: "1.0.0",
        authType: "CUSTOM_AUTH",
        supported: true,
        fields: [
          {
            name: "host",
            label: "Host",
            required: true,
            secret: false,
            description: undefined,
          },
          {
            name: "port",
            label: "Port",
            required: false,
            secret: false,
            description: undefined,
          },
          {
            name: "username",
            label: "Username",
            required: true,
            secret: false,
            description: undefined,
          },
          {
            name: "password",
            label: "Password",
            required: true,
            secret: true,
            description: undefined,
          },
        ],
        actions: ["fetchMailbox", "fetchMessages"],
        triggers: ["newMessage"],
      },
    ]);
  });

  it("narrows the catalog with a case-insensitive query", async () => {
    serve({ pieceCatalog: [IMAP_PIECE, SLACK_PIECE], ...LISTINGS });

    const match = await tools.getConnectors("Emails");
    expect(match.matches).toBe(1);
    expect(match.connectors[0].pieceName).toBe(IMAP_PIECE.name);

    const miss = await tools.getConnectors("zoom");
    expect(miss.matches).toBe(0);
    expect(miss.connectors).toEqual([]);
  });

  it("ranks with the runtime's search, actions and triggers interleaved", async () => {
    const match = (pieceName: string) => ({
      pieceName,
      pieceVersion: "1.0.0",
      displayName: pieceName,
      description: "",
      logoUrl: "",
      categories: [],
      source: "activepieces",
      deprecated: null,
      unsupported: null,
      namedPiece: false,
      blocks: [],
    });
    const asked: unknown[] = [];
    serve({
      pieceCatalog: [IMAP_PIECE, SLACK_PIECE],
      ...LISTINGS,
      searchPieces: (args: { query: string; kind: string }) => {
        asked.push(args);
        return {
          status: "ready",
          indexedPieces: 2,
          error: null,
          pieces:
            args.kind === "action"
              ? [match(SLACK_PIECE.name), match("@acme/piece-unlisted")]
              : [match(IMAP_PIECE.name), match(SLACK_PIECE.name)],
        };
      },
    });

    const result = await tools.getConnectors("send message");

    expect(asked).toEqual([
      expect.objectContaining({ query: "send message", kind: "action" }),
      expect.objectContaining({ query: "send message", kind: "trigger" }),
    ]);
    // A piece the catalog does not list is not a connector.
    expect(result.connectors.map((entry) => entry.pieceName)).toEqual([
      SLACK_PIECE.name,
      IMAP_PIECE.name,
    ]);
  });

  it("answers a package name exactly, and falls back when the search ranks nothing", async () => {
    let searches = 0;
    serve({
      pieceCatalog: [IMAP_PIECE, SLACK_PIECE],
      ...LISTINGS,
      searchPieces: () => {
        searches += 1;
        return { status: "ready", indexedPieces: 2, error: null, pieces: [] };
      },
    });

    const exact = await tools.getConnectors(SLACK_PIECE.name);
    expect(exact.connectors.map((entry) => entry.pieceName)).toEqual([
      SLACK_PIECE.name,
    ]);
    expect(searches).toBe(0);

    const fallback = await tools.getConnectors("emails");
    expect(fallback.connectors.map((entry) => entry.pieceName)).toEqual([
      IMAP_PIECE.name,
    ]);
  });

  it("falls back to a substring match while the search indexes", async () => {
    serve({
      pieceCatalog: [IMAP_PIECE, SLACK_PIECE],
      ...LISTINGS,
      searchPieces: () => ({
        status: "indexing",
        indexedPieces: 0,
        error: null,
        pieces: [],
      }),
    });

    const result = await tools.getConnectors("emails");

    expect(result.connectors.map((entry) => entry.pieceName)).toEqual([
      IMAP_PIECE.name,
    ]);
  });

  it("caps the detail page at 20 and reports truncation", async () => {
    const catalog = Array.from({ length: 25 }, (_, index) => ({
      ...SLACK_PIECE,
      name: `@activepieces/piece-${index}`,
      displayName: `Piece ${index}`,
      description: "",
    }));
    serve({ pieceCatalog: catalog, ...LISTINGS });

    const result = await tools.getConnectors();

    expect(result.total).toBe(25);
    expect(result.connectors).toHaveLength(20);
    expect(result.truncated).toBe(true);
  });

  it("asks for an OAuth2 app and flags the sign-in it still needs", async () => {
    serve({ pieceCatalog: [SLACK_PIECE], ...LISTINGS });

    const result = await tools.getConnectors();

    expect(result.connectors[0]).toMatchObject({
      connectorId: "@activepieces/piece-slack#slack",
      authType: "OAUTH2",
      supported: true,
      signIn: "oauth2",
      fields: [
        expect.objectContaining({ name: "client_id", secret: false }),
        expect.objectContaining({ name: "client_secret", secret: true }),
      ],
    });
  });
});

describe("getConnections", () => {
  const CONNECTIONS = [
    {
      id: "conn-1",
      name: "Work mail",
      connectorId: "@activepieces/piece-imap#imap",
      authType: "CUSTOM_AUTH",
      status: "ERROR",
      accountLabel: null,
    },
    {
      id: "conn-2",
      name: "Personal mail",
      connectorId: "@activepieces/piece-imap#imap",
      authType: "CUSTOM_AUTH",
      status: "OK",
      accountLabel: "user@example.com",
    },
  ];

  it("reports missing required secrets and config per connection", async () => {
    const client = {
      get: (id: string) =>
        Promise.resolve(
          id === "conn-1"
            ? {
                state: {
                  global: {
                    config: { port: 993, username: "user@example.com" },
                    secretRefs: [],
                  },
                },
              }
            : {
                state: {
                  global: {
                    config: {
                      host: "mail.example.com",
                      port: 993,
                      username: "me@example.com",
                    },
                    secretRefs: [
                      { id: "oid-1", name: "password", ref: "secret://v1:abc" },
                    ],
                  },
                },
              },
        ),
    };
    installWindow(client);
    serve({ pieceCatalog: [IMAP_PIECE], connections: CONNECTIONS });

    const result = await tools.getConnections();

    expect(result.connections).toEqual([
      {
        id: "conn-1",
        name: "Work mail",
        connectorId: "@activepieces/piece-imap#imap",
        authType: "CUSTOM_AUTH",
        status: "ERROR",
        accountLabel: null,
        missingSecrets: ["password"],
        missingConfig: ["host"],
      },
      {
        id: "conn-2",
        name: "Personal mail",
        connectorId: "@activepieces/piece-imap#imap",
        authType: "CUSTOM_AUTH",
        status: "OK",
        accountLabel: "user@example.com",
        missingSecrets: [],
        missingConfig: [],
      },
    ]);
  });

  it("treats null and empty-string config values as missing, not false/0", async () => {
    installWindow({
      get: () =>
        Promise.resolve({
          state: {
            global: {
              config: {
                host: null,
                port: 0,
                username: "",
                verifySsl: false,
              },
              secretRefs: [
                { id: "oid-1", name: "password", ref: "secret://v1:abc" },
              ],
            },
          },
        }),
    });
    serve({ pieceCatalog: [IMAP_PIECE], connections: [CONNECTIONS[1]] });

    const result = await tools.getConnections();

    // IMAP_PIECE's required config fields are host and username.
    expect(result.connections[0].missingConfig.sort()).toEqual([
      "host",
      "username",
    ]);
  });

  it("treats an unknown connector as authless", async () => {
    installWindow({
      get: () => Promise.resolve({ state: { global: {} } }),
    });
    serve({
      pieceCatalog: [IMAP_PIECE],
      connections: [
        {
          id: "conn-3",
          name: "Mystery",
          connectorId: "@acme/piece-unknown#unknown",
          authType: "NONE",
          status: "OK",
          accountLabel: null,
        },
      ],
    });

    const result = await tools.getConnections();

    expect(result.connections[0]).toMatchObject({
      missingSecrets: [],
      missingConfig: [],
    });
  });
});

describe("checkConnection", () => {
  it("passes the mutation result through and targets the drive's subgraph", async () => {
    const server = serve({
      checkConnection: ({ connectionId }: { connectionId: string }) =>
        connectionId === "conn-1"
          ? { ok: true, detail: "Connected", accountLabel: "user@example.com" }
          : { ok: false, detail: "Unknown connection", accountLabel: null },
    });
    installWindow(undefined, { "drive-1": "http://remote:4001/graphql/r" });

    const check = tools.checkConnectionTool.callback as (args: {
      connectionId: string;
    }) => Promise<unknown>;
    const good = await check({ connectionId: "conn-1" });
    expect(good).toEqual({
      ok: true,
      detail: "Connected",
      accountLabel: "user@example.com",
    });

    const bad = await check({ connectionId: "conn-2" });
    expect(bad).toEqual({
      ok: false,
      detail: "Unknown connection",
      accountLabel: null,
    });

    expect(server.sent.map((request) => request.url)).toEqual([
      "http://remote:4001/graphql/workflow-runtime",
      "http://remote:4001/graphql/workflow-runtime",
    ]);
  });
});

describe("tool descriptors", () => {
  it("exposes the three read-only connection tools ahead of the workflow tools", async () => {
    const { workflowTools } = await import("./workflow-tools.js");
    const connectionTools = [
      "getConnectors",
      "getConnections",
      "checkConnection",
    ];
    const names = tools.aiTools.map((tool) => tool.name);
    expect(names).toEqual([
      ...connectionTools,
      ...workflowTools.map((tool) => tool.name),
    ]);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of tools.aiTools.slice(0, 3)) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
    }
  });
});
