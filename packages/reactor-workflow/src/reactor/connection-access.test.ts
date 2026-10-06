// The design-time surfaces that hand a connection's credentials to piece code
// authorize their caller, here against the grants of a real in-process reactor.
import type {
  InProcessReactorClientModule,
  IReactorClient,
} from "@powerhousedao/reactor";
import {
  actions as connectionActions,
  type ConnectionDocument,
} from "@powerhousedao/workflow/document-models/connection";
import { actions as workflowActions } from "@powerhousedao/workflow/document-models/workflow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  connectionReactor,
  createDocument,
  reactorReadGate,
  readingAs,
} from "../../test/helpers/connection-reactor.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import type { WorkflowRuntimeService } from "./service.js";

const ME = "0xabc";
const THEM = "0xdef";
// The runtime reads as the host, which every document here admits.
const HOST = "0x0057";
const BLOCK = {
  pieceName: "@acme/piece-slack",
  pieceVersion: "1.0.0",
  kind: "action" as const,
  name: "send_message",
};
const MINE = ["conn-mine", "conn-mine-2"];
const CHECKED_AT = "2026-09-04T00:00:00.000Z";
const CTX = { headers: {}, db: {}, user: { address: ME } } as never;

let reactor: InProcessReactorClientModule;
let runtime: WorkflowRuntimeService;

// The host's write gate: whether the reactor would admit a check's record.
function reactorWriteGate(module: InProcessReactorClientModule) {
  return async (id: string, caller: object) => {
    const address = (caller as { user?: { address?: string } }).user?.address;
    const { allAllowed } = await module.client.evaluateActions(
      id,
      "main",
      [{ scope: "global", type: "RECORD_CHECK_RESULT" }],
      { address },
    );
    if (!allAllowed) throw new Error("forbidden write");
  };
}

function connectionSetup() {
  return [
    connectionActions.setConnector({
      connectorId: "@acme/piece-slack#slack",
      authType: "SECRET_TEXT",
    }),
    connectionActions.setConfig({ config: { channel: "general" } }),
    connectionActions.recordCheckResult({
      status: "OK",
      checkedAt: CHECKED_AT,
    }),
  ];
}

function workflowWithTrigger(connectionId: string) {
  return [
    workflowActions.setTrigger({
      id: "t",
      pieceName: BLOCK.pieceName,
      pieceVersion: BLOCK.pieceVersion,
      triggerName: "new_message",
      config: {},
      connectionId,
    }),
  ];
}

function serviceOver(client: IReactorClient): WorkflowRuntimeService {
  return testRuntime({
    reactorClient: readingAs(client, HOST),
    assertCanRead: reactorReadGate(reactor),
    assertCanWrite: reactorWriteGate(reactor),
  });
}

beforeAll(async () => {
  reactor = await connectionReactor({ authEnforcement: true });
  for (const id of MINE) {
    await createDocument(reactor, "connection", id, connectionSetup(), [
      ME,
      HOST,
    ]);
  }
  await createDocument(
    reactor,
    "connection",
    "conn-theirs",
    connectionSetup(),
    [THEM, HOST],
  );
  await createDocument(
    reactor,
    "workflow",
    "wf-theirs",
    workflowWithTrigger("conn-theirs"),
    [THEM, HOST],
  );
  // Readable to me; the credentials it would resolve are not.
  await createDocument(
    reactor,
    "workflow",
    "wf-mine-their-conn",
    workflowWithTrigger("conn-theirs"),
    [ME, HOST],
  );
  runtime = serviceOver(reactor.client);
});

afterAll(() => {
  reactor.reactor.kill();
});

describe("design-time connection access", () => {
  it("refuses blockOptions for a connection the caller cannot read", async () => {
    // Refused before the block resolves, so before any credential is fetched.
    await expect(
      runtime.blockOptions(BLOCK, "channel", {}, "conn-theirs", CTX),
    ).rejects.toThrow("forbidden");
    // Its own connection passes the gate and fails later, on the bundle.
    await expect(
      runtime.blockOptions(BLOCK, "channel", {}, "conn-mine", CTX),
    ).rejects.not.toThrow(/forbidden/);
  });

  it("refuses blockOptions when the request carries no caller", async () => {
    await expect(
      runtime.blockOptions(BLOCK, "channel", {}, "conn-theirs"),
    ).rejects.toThrow("authenticated request");
  });

  it("leaves a connection-less blockOptions call alone", async () => {
    // No connectionId, so nothing to authorize; it fails later, on the bundle.
    await expect(
      runtime.blockOptions(BLOCK, "channel", {}, undefined, CTX),
    ).rejects.not.toThrow(/forbidden|authenticated request/);
  });

  it("refuses testTrigger for a workflow the caller cannot read", async () => {
    await expect(runtime.testTrigger("wf-theirs", CTX)).rejects.toThrow(
      "forbidden",
    );
  });

  it("refuses testTrigger when the request carries no caller", async () => {
    await expect(runtime.testTrigger("wf-theirs")).rejects.toThrow(
      "authenticated request",
    );
  });

  it("refuses testTrigger when only the trigger's connection is off limits", async () => {
    await expect(
      runtime.testTrigger("wf-mine-their-conn", CTX),
    ).rejects.toThrow("forbidden");
  });

  const ids = (listed: { id: string }[]) =>
    listed.map((entry) => entry.id).sort();

  it("lists only the connections the caller may read", async () => {
    expect(ids(await runtime.connections(CTX))).toEqual(MINE);
  });

  it("lists connections past the reactor's first page", async () => {
    // One result per page: two readable connections never share one.
    const client = reactor.client;
    const paged = serviceOver(
      Object.assign(Object.create(client) as IReactorClient, {
        find: (search: never, view: never) =>
          client.find(search, view, { cursor: "", limit: 1 }),
      }),
    );

    expect(ids(await paged.connections(CTX))).toEqual(MINE);
  });

  it("lists nothing to a caller it cannot identify", async () => {
    expect(await runtime.connections()).toEqual([]);
  });

  it("refuses checkConnection to a caller who may only read", async () => {
    // Every outcome of a check is recorded on the connection, so reading it
    // is not enough to run one.
    await expect(runtime.checkConnection("conn-mine", CTX)).rejects.toThrow(
      "forbidden write",
    );
    const stored = await reactor.client.get<ConnectionDocument>("conn-mine", {
      subject: { address: HOST },
    });
    expect(stored.state.global).toMatchObject({
      status: "OK",
      lastCheckedAt: CHECKED_AT,
    });
  });
});
