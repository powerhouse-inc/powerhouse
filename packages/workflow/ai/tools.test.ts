import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ToolsModule from "./tools.js";

const SWITCHBOARD = {
  switchboardUrl: "http://localhost:4001",
  graphqlUrl: "http://localhost:4001/graphql",
};

vi.mock("@powerhousedao/reactor-browser/ai", () => ({
  resolveDriveSwitchboard: vi.fn(() => SWITCHBOARD),
}));

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

type Handler = (variables: Record<string, unknown>) => unknown;

interface Routes {
  catalog?: unknown;
  actions?: Handler;
  triggers?: Handler;
  connections?: unknown;
  check?: Handler;
}

function graphqlFetch(routes: Routes) {
  return vi.fn((_url: string, init?: { body?: string }): Response => {
    const body = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    const kind = body.query.includes("pieceCatalog")
      ? "catalog"
      : body.query.includes("pieceActions")
        ? "actions"
        : body.query.includes("pieceTriggers")
          ? "triggers"
          : body.query.includes("connections")
            ? "connections"
            : "check";
    const route = routes[kind];
    const data =
      typeof route === "function" ? (route as Handler)(body.variables) : route;
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

function installWindow(client?: {
  get: (id: string) => Promise<{ state: { global?: unknown } }>;
}): void {
  vi.stubGlobal("window", {
    ph: { selectedDriveId: "drive-1", reactorClient: client },
  });
}

let tools: typeof ToolsModule;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  tools = await import("./tools.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getConnectors", () => {
  it("returns the full plan for each catalog entry", async () => {
    const fetch = graphqlFetch({
      catalog: { workflowRuntime: { pieceCatalog: [IMAP_PIECE] } },
      actions: (vars) => ({
        workflowRuntime: {
          pieceActions: {
            actions:
              vars.packageName === IMAP_PIECE.name
                ? [
                    {
                      name: "fetchMailbox",
                      displayName: "Fetch mailbox",
                      description: "",
                      blockType: "",
                    },
                    {
                      name: "fetchMessages",
                      displayName: "Fetch messages",
                      description: "",
                      blockType: "",
                    },
                  ]
                : [],
          },
        },
      }),
      triggers: (vars) => ({
        workflowRuntime: {
          pieceTriggers: {
            triggers:
              vars.packageName === IMAP_PIECE.name
                ? [
                    {
                      name: "newMessage",
                      displayName: "New message",
                      description: "",
                      strategy: "",
                      blockType: "",
                    },
                  ]
                : [],
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetch);

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
    vi.stubGlobal(
      "fetch",
      graphqlFetch({
        catalog: {
          workflowRuntime: { pieceCatalog: [IMAP_PIECE, SLACK_PIECE] },
        },
        actions: () => ({ workflowRuntime: { pieceActions: { actions: [] } } }),
        triggers: () => ({
          workflowRuntime: { pieceTriggers: { triggers: [] } },
        }),
      }),
    );

    const match = await tools.getConnectors("Emails");
    expect(match.matches).toBe(1);
    expect(match.connectors[0].pieceName).toBe(IMAP_PIECE.name);

    const miss = await tools.getConnectors("zoom");
    expect(miss.matches).toBe(0);
    expect(miss.connectors).toEqual([]);
  });

  it("caps the detail page at 20 and reports truncation", async () => {
    const catalog = Array.from({ length: 25 }, (_, index) => ({
      ...SLACK_PIECE,
      name: `@activepieces/piece-${index}`,
      displayName: `Piece ${index}`,
      description: "",
    }));
    vi.stubGlobal(
      "fetch",
      graphqlFetch({
        catalog: { workflowRuntime: { pieceCatalog: catalog } },
        actions: () => ({ workflowRuntime: { pieceActions: { actions: [] } } }),
        triggers: () => ({
          workflowRuntime: { pieceTriggers: { triggers: [] } },
        }),
      }),
    );

    const result = await tools.getConnectors();

    expect(result.total).toBe(25);
    expect(result.connectors).toHaveLength(20);
    expect(result.truncated).toBe(true);
  });

  it("flags auth kinds the runtime cannot execute yet", async () => {
    vi.stubGlobal(
      "fetch",
      graphqlFetch({
        catalog: { workflowRuntime: { pieceCatalog: [SLACK_PIECE] } },
        actions: () => ({ workflowRuntime: { pieceActions: { actions: [] } } }),
        triggers: () => ({
          workflowRuntime: { pieceTriggers: { triggers: [] } },
        }),
      }),
    );

    const result = await tools.getConnectors();

    expect(result.connectors[0]).toMatchObject({
      connectorId: "@activepieces/piece-slack#slack",
      authType: "OAUTH2",
      supported: false,
      fields: [],
    });
  });
});

describe("getConnections", () => {
  const CONNECTIONS = {
    workflowRuntime: {
      connections: [
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
      ],
    },
  };

  it("reports missing required secrets and config per connection", async () => {
    const client = {
      get: vi.fn((id: string) =>
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
      ),
    };
    installWindow(client);
    vi.stubGlobal(
      "fetch",
      graphqlFetch({
        catalog: { workflowRuntime: { pieceCatalog: [IMAP_PIECE] } },
        connections: CONNECTIONS,
      }),
    );

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
    const client = {
      get: vi.fn(() =>
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
      ),
    };
    installWindow(client);
    vi.stubGlobal(
      "fetch",
      graphqlFetch({
        catalog: { workflowRuntime: { pieceCatalog: [IMAP_PIECE] } },
        connections: {
          workflowRuntime: {
            connections: [CONNECTIONS.workflowRuntime.connections[1]],
          },
        },
      }),
    );

    const result = await tools.getConnections();

    // IMAP_PIECE's required config fields are host and username.
    expect(result.connections[0].missingConfig.sort()).toEqual([
      "host",
      "username",
    ]);
  });

  it("treats an unknown connector as authless", async () => {
    installWindow({
      get: vi.fn(() => Promise.resolve({ state: { global: {} } })),
    });
    vi.stubGlobal(
      "fetch",
      graphqlFetch({
        catalog: { workflowRuntime: { pieceCatalog: [IMAP_PIECE] } },
        connections: {
          workflowRuntime: {
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
          },
        },
      }),
    );

    const result = await tools.getConnections();

    expect(result.connections[0]).toMatchObject({
      missingSecrets: [],
      missingConfig: [],
    });
  });
});

describe("checkConnection", () => {
  it("passes the mutation result through and targets the subgraph", async () => {
    const fetch = graphqlFetch({
      check: (vars) => ({
        workflowRuntime: {
          checkConnection:
            vars.connectionId === "conn-1"
              ? {
                  ok: true,
                  detail: "Connected",
                  accountLabel: "user@example.com",
                }
              : { ok: false, detail: "Unknown connection", accountLabel: null },
        },
      }),
    });
    vi.stubGlobal("fetch", fetch);
    installWindow();

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

    const [url, init] = fetch.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("http://localhost:4001/graphql/workflow-runtime");
    const sent = JSON.parse(init.body) as {
      query: string;
      variables: { connectionId: string };
    };
    expect(sent.variables).toEqual({ connectionId: "conn-1" });
    // The supergraph rejects a ConnectionCheckResult field without a
    // selection set, so the mutation must request every subfield.
    expect(sent.query).toContain("ok");
    expect(sent.query).toContain("detail");
    expect(sent.query).toContain("accountLabel");
  });
});

describe("tool descriptors", () => {
  it("exposes the three read-only connection tools ahead of the workflow tools", () => {
    const connectionTools = [
      "getConnectors",
      "getConnections",
      "checkConnection",
    ];
    const names = tools.aiTools.map((tool) => tool.name);
    expect(names.slice(0, 3)).toEqual(connectionTools);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of tools.aiTools.slice(0, 3)) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
    }
  });
});
