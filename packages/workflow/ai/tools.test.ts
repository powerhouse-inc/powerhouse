import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as RuntimeApiModule from "../editors/workflow-editor/runtime-api.js";
import { schemaFetch, type RuntimeRoot } from "../test/runtime-schema.js";
import { switchboardAt, toolContext } from "../test/switchboards.js";
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

let tools: typeof ToolsModule;
let runtimeApi: typeof RuntimeApiModule;

// The runtime of the one switchboard at http://sb.
const runtime = () => runtimeApi.runtimeAt(switchboardAt("http://sb"));

const reader = (
  get: (id: string) => Promise<{ state: { global?: unknown } }>,
) => toolContext({ reactorGet: get }).reactor;

beforeEach(async () => {
  vi.resetModules();
  tools = await import("./tools.js");
  // The same module instance tools.js uses, so its cache starts empty.
  runtimeApi = await import("../editors/workflow-editor/runtime-api.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getConnectors", () => {
  it("returns the full plan for each catalog entry", async () => {
    serve({ pieceCatalog: [IMAP_PIECE], ...LISTINGS });

    const result = await tools.getConnectors(runtime());

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

    const match = await tools.getConnectors(runtime(), "Emails");
    expect(match.matches).toBe(1);
    expect(match.connectors[0].pieceName).toBe(IMAP_PIECE.name);

    const miss = await tools.getConnectors(runtime(), "zoom");
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

    const result = await tools.getConnectors(runtime(), "send message");

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

    const exact = await tools.getConnectors(runtime(), SLACK_PIECE.name);
    expect(exact.connectors.map((entry) => entry.pieceName)).toEqual([
      SLACK_PIECE.name,
    ]);
    expect(searches).toBe(0);

    const fallback = await tools.getConnectors(runtime(), "emails");
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

    const result = await tools.getConnectors(runtime(), "emails");

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

    const result = await tools.getConnectors(runtime());

    expect(result.total).toBe(25);
    expect(result.connectors).toHaveLength(20);
    expect(result.truncated).toBe(true);
  });

  it("asks for an OAuth2 app and flags the sign-in it still needs", async () => {
    serve({ pieceCatalog: [SLACK_PIECE], ...LISTINGS });

    const result = await tools.getConnectors(runtime());

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
    serve({ pieceCatalog: [IMAP_PIECE], connections: CONNECTIONS });

    const result = await tools.getConnections(runtime(), reader(client.get));

    expect(result.switchboard).toBe("sb");
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
    const get = () =>
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
      });
    serve({ pieceCatalog: [IMAP_PIECE], connections: [CONNECTIONS[1]] });

    const result = await tools.getConnections(runtime(), reader(get));

    // IMAP_PIECE's required config fields are host and username.
    expect(result.connections[0].missingConfig.sort()).toEqual([
      "host",
      "username",
    ]);
  });

  it("treats an unknown connector as authless", async () => {
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

    const result = await tools.getConnections(
      runtime(),
      reader(() => Promise.resolve({ state: { global: {} } })),
    );

    expect(result.connections[0]).toMatchObject({
      missingSecrets: [],
      missingConfig: [],
    });
  });

  it("reports what the runtime holds when the host gives no reactor", async () => {
    serve({ pieceCatalog: [IMAP_PIECE], connections: [CONNECTIONS[1]] });

    const result = await tools.getConnections(runtime());

    // Without the document, nothing is known to be stored.
    expect(result.connections[0].missingSecrets).toEqual(["password"]);
  });
});

describe("checkConnection", () => {
  type Check = (
    args: { connectionId: string; switchboard?: string },
    context?: unknown,
  ) => Promise<unknown>;
  const check = () => tools.checkConnectionTool.callback as Check;
  const checks = {
    checkConnection: ({ connectionId }: { connectionId: string }) =>
      connectionId === "conn-1"
        ? { ok: true, detail: "Connected", accountLabel: "user@example.com" }
        : { ok: false, detail: "Unknown connection", accountLabel: null },
  };

  it("passes the mutation result through from the only switchboard's runtime", async () => {
    const server = serve(checks);
    const context = toolContext({
      switchboards: [switchboardAt("http://remote:4001")],
    });

    const good = await check()({ connectionId: "conn-1" }, context);
    expect(good).toEqual({
      switchboard: "sb",
      ok: true,
      detail: "Connected",
      accountLabel: "user@example.com",
    });

    const bad = await check()({ connectionId: "conn-2" }, context);
    expect(bad).toEqual({
      switchboard: "sb",
      ok: false,
      detail: "Unknown connection",
      accountLabel: null,
    });

    expect(server.sent.map((request) => request.url)).toEqual([
      "http://remote:4001/graphql/workflow-runtime",
      "http://remote:4001/graphql/workflow-runtime",
    ]);
  });

  it("asks the switchboard serving the connection, or the one named", async () => {
    const server = serve(checks);
    const context = toolContext({
      switchboards: [
        switchboardAt("http://laptop:2540", { name: "laptop" }),
        switchboardAt("https://cloud.example.com", { name: "cloud" }),
      ],
      placed: { "conn-1": "cloud" },
    });

    await check()({ connectionId: "conn-1" }, context);
    await check()({ connectionId: "conn-1", switchboard: "laptop" }, context);

    expect(server.sent.map((request) => request.url)).toEqual([
      "https://cloud.example.com/graphql/workflow-runtime",
      "http://laptop:2540/graphql/workflow-runtime",
    ]);
  });
});

describe("picking the switchboard", () => {
  type Call = (args: object, context?: unknown) => Promise<unknown>;
  const getConnectorsCall = () => tools.getConnectorsTool.callback as Call;

  it("refuses to guess between two switchboards that run workflows", async () => {
    const server = serve({ pieceCatalog: [IMAP_PIECE], ...LISTINGS });
    const context = toolContext({
      switchboards: [
        switchboardAt("http://laptop:2540", { name: "laptop" }),
        switchboardAt("https://cloud.example.com", { name: "cloud" }),
      ],
    });

    await expect(getConnectorsCall()({}, context)).rejects.toThrow(
      /several switchboards \(laptop \(http:\/\/laptop:2540, runs workflows\); cloud .*name one with "switchboard"/,
    );
    expect(server.sent).toEqual([]);

    const named = (await getConnectorsCall()(
      { switchboard: "cloud" },
      context,
    )) as { switchboard: string };
    expect(named.switchboard).toBe("cloud");
  });

  it("says so when the host gives no switchboards, instead of guessing a URL", async () => {
    const server = serve({ pieceCatalog: [IMAP_PIECE], ...LISTINGS });

    await expect(getConnectorsCall()({})).rejects.toThrow(
      /provides no switchboard directory/,
    );
    await expect(
      getConnectorsCall()({}, toolContext({ switchboards: [] })),
    ).rejects.toThrow(/reaches no switchboard/);
    expect(server.sent).toEqual([]);
  });

  it("names the runtime it could not reach", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.reject(new TypeError("Failed to fetch")),
    );

    await expect(getConnectorsCall()({}, toolContext())).rejects.toThrow(
      "The workflow runtime at http://sb/graphql/workflow-runtime could not be reached: Failed to fetch",
    );
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
