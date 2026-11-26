import type { Operation } from "@powerhousedao/shared/document-model";
import { testSigner } from "@powerhousedao/shared/testing";
import type { SwitchboardReactor } from "@powerhousedao/switchboard/server";
import type { ILogger } from "document-model";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ServiceManager } from "../src/core/types.js";
import {
  disconnectAllMcp,
  discoverMcpTools,
} from "../src/integrations/mastra/mcp.js";

// An agent's MCP discovery runs the endpoint's reactor tools in its own
// process, over the endpoint's switchboard, signed as the agent's session:
// a real switchboard here, discovered as a service with an `api-mcp` endpoint.

function quietLogger(): ILogger {
  const noop = () => undefined;
  const logger = {
    level: "error",
    verbose: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    errorHandler: noop,
    child: () => logger,
  };
  return logger as unknown as ILogger;
}

let root: string;
let switchboard: SwitchboardReactor | undefined;
let services: ServiceManager;

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "clint-mcp-in-process-"));
  const { startSwitchboard } =
    await import("@powerhousedao/switchboard/server");
  switchboard = await startSwitchboard(
    {
      server: { port: 0, host: "127.0.0.1" },
      storage: { inMemory: true, userDataDir: path.join(root, "user") },
      features: { workflows: false, mcp: false },
      packages: { disableLocal: true, list: [] },
      identity: { keypairPath: path.join(root, "identity.json") },
      protocol: { createSignaturePolicy: "legacy" },
    },
    { logger: quietLogger(), signalHandlers: false, fatalErrorShutdown: false },
  );
  const origin = `http://127.0.0.1:${switchboard.port}`;
  services = {
    list: () => [
      {
        serviceId: "preview",
        instanceId: "preview:one",
        name: "Preview",
        status: "ready",
        pid: 1,
        endpoints: { mcp: `${origin}/mcp` },
        endpointTypes: { mcp: "api-mcp" },
      },
    ],
  } as unknown as ServiceManager;
}, 120_000);

afterAll(async () => {
  await switchboard?.shutdown();
  rmSync(root, { recursive: true, force: true, maxRetries: 10 });
}, 60_000);

beforeEach(async () => {
  await disconnectAllMcp();
});

describe("in-process MCP discovery", () => {
  it("runs the endpoint's reactor tools here, every write signed as the agent's session", async () => {
    const agent = await testSigner("0xagent", { app: "vetra agent x" });
    const tools = await discoverMcpTools(
      services,
      undefined,
      undefined,
      undefined,
      {
        signer: () => Promise.resolve(agent),
      },
    );
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        "preview-mcp__getDocument",
        "preview-mcp__createDocument",
        "preview-mcp__addActions",
        "preview-mcp__deleteDocument",
        "preview-mcp__addDrive",
        "preview-mcp__deleteDrive",
      ]),
    );

    const created = (await tools["preview-mcp__createDocument"].execute(
      { documentType: "powerhouse/document-model", name: "Agent's" },
      {},
    )) as { isError?: boolean; structuredContent?: { documentId: string } };
    expect(created.isError).toBeFalsy();
    const documentId = created.structuredContent!.documentId;

    const page = await switchboard!.reactor.getOperations(
      documentId,
      undefined,
      undefined,
      { cursor: "", limit: 100 },
    );
    const operations: Operation[] = page.results;
    expect(operations.map((op) => op.action.type)).toContain("CREATE_DOCUMENT");
    const hostKey = switchboard!.renown?.signer.app?.key;
    for (const operation of operations) {
      const signer = operation.action.context?.signer;
      expect(signer?.app.key).toBe(agent.app?.key);
      expect(signer?.app.key).not.toBe(hostKey);
      expect(signer?.user.address).toBe("0xagent");
    }
  }, 60_000);

  it("adds and deletes a drive here, every write signed as the agent's session", async () => {
    const agent = await testSigner("0xagent", { app: "vetra agent x" });
    const tools = await discoverMcpTools(
      services,
      undefined,
      undefined,
      undefined,
      { signer: () => Promise.resolve(agent) },
    );
    const added = (await tools["preview-mcp__addDrive"].execute(
      { name: "Agent's drive" },
      {},
    )) as { isError?: boolean; structuredContent?: { driveId: string } };
    expect(added.isError).toBeFalsy();
    const driveId = added.structuredContent!.driveId;

    const page = await switchboard!.reactor.getOperations(
      driveId,
      undefined,
      undefined,
      { cursor: "", limit: 100 },
    );
    const operations: Operation[] = page.results;
    expect(operations.map((op) => op.action.type)).toEqual(
      expect.arrayContaining(["CREATE_DOCUMENT", "SET_NAME", "SET_DRIVE_NAME"]),
    );
    for (const operation of operations) {
      expect(operation.action.context?.signer?.user.address).toBe("0xagent");
    }

    const deleted = (await tools["preview-mcp__deleteDrive"].execute(
      { documentId: driveId },
      {},
    )) as { isError?: boolean };
    expect(deleted.isError).toBeFalsy();
    await expect(switchboard!.reactor.get(driveId)).rejects.toThrow();
  }, 60_000);

  it("leaves the tools on the endpoint for an endpoint whose session has no signer", async () => {
    await expect(
      discoverMcpTools(services, undefined, undefined, undefined, {
        signer: () => Promise.resolve(undefined),
      }),
    ).resolves.toEqual({});
  });
});
