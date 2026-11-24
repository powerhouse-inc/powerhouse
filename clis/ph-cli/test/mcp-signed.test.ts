/**
 * F3c end to end: `ph mcp` runs the writing tools in its own process, and an
 * MCP client's writes are signed by that client's own session.
 *
 * A real switchboard in this process (in memory, its data folder the
 * project), the project's Vetra record naming it, and the built `ph mcp` in a
 * child process, talked to over stdio as the MCP client `test-client`. The
 * child makes a pseudonym on the spot, a session labelled `mcp test-client`
 * in the project's data folder, and the credential's record there. Every
 * operation the client wrote names that session; none is the switchboard's.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { listCredentialRecords } from "@powerhousedao/shared/clis/credential-records";
import { readActiveIdentity } from "@powerhousedao/shared/clis/identity";
import type { Operation } from "@powerhousedao/shared/document-model";
import {
  startSwitchboard,
  type SwitchboardReactor,
} from "@powerhousedao/switchboard/server";
import { createSignatureVerifier } from "@renown/sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeVetraRuntime } from "../src/utils/vetra-runtime.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PH_CLI = path.resolve(here, "../dist/cli.mjs");
const PROJECT_NAME = "mcp-signed-test";
const LABEL = "mcp test-client";

let root: string;
let project: string;
let home: string;
let switchboard: SwitchboardReactor | undefined;
let client: Client | undefined;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-mcp-signed-"));
  project = path.join(root, "project");
  home = path.join(root, "identities");
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(
    path.join(project, "package.json"),
    JSON.stringify({ name: PROJECT_NAME, private: true }),
  );
  fs.writeFileSync(path.join(project, "powerhouse.config.json"), "{}");

  const started = await startSwitchboard(
    {
      server: { port: 0, host: "127.0.0.1" },
      storage: { inMemory: true, userDataDir: project },
      features: { workflows: false, mcp: true },
      packages: { disableLocal: true, list: [] },
      identity: {
        keypairPath: path.join(root, "switchboard", ".keypair.json"),
        storagePath: path.join(root, "switchboard", ".renown.json"),
      },
      protocol: { createSignaturePolicy: "legacy" },
    },
    { signalHandlers: false, fatalErrorShutdown: false },
  );
  switchboard = started;
  const origin = `http://127.0.0.1:${started.port}`;
  writeVetraRuntime(project, {
    pid: process.pid,
    projectName: PROJECT_NAME,
    switchboardPort: started.port,
    connectPort: 0,
    switchboardUrl: `${origin}/graphql`,
    mcpUrl: `${origin}/mcp`,
    startedAt: new Date().toISOString(),
  });

  const env = { ...process.env } as Record<string, string>;
  delete env.PH_CALLER_CWD;
  delete env.PH_USER_DATA_DIR;
  delete env.PH_IDENTITY_KEY;
  const mcp = new Client({ name: "test-client", version: "1.0.0" });
  client = mcp;
  await mcp.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [PH_CLI, "mcp", "--start-timeout", "5"],
      cwd: project,
      env: { ...env, PH_NO_TELEMETRY: "1", PH_IDENTITY_HOME: home },
      stderr: "ignore",
    }),
  );
}, 120_000);

afterAll(async () => {
  await client?.close();
  await switchboard?.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
}, 60_000);

async function call(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const result = (await client!.callTool({
    name,
    arguments: args,
  })) as CallToolResult;
  expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
  return result;
}

describe("ph mcp", () => {
  it("signs an MCP client's writes as its own session, the creation included", async () => {
    const created = await call("createDocument", {
      documentType: "powerhouse/document-model",
      name: "Signed Model",
    });
    const { documentId } = created.structuredContent as { documentId: string };
    await call("addActions", {
      documentId,
      actions: [
        { type: "SET_MODEL_NAME", input: { name: "Signed" } },
        { type: "SET_MODEL_ID", input: { id: "test/signed" } },
      ],
    });

    // The pseudonym, made when the first action was to be signed.
    const person = readActiveIdentity({
      dataDir: project,
      env: { PH_IDENTITY_HOME: home },
    });
    expect(person?.kind).toBe("pseudonym");
    const [record] = listCredentialRecords({ dataDir: project });
    expect(record).toMatchObject({
      address: person!.address.toLowerCase(),
      label: LABEL,
      source: "cli",
    });
    expect(
      fs.existsSync(
        path.join(project, ".ph", "sessions", "mcp-test-client.json"),
      ),
    ).toBe(true);
    const sessionKey = record!.sessionDid;

    const reactor = switchboard!;
    const page = await reactor.reactor.getOperations(
      documentId,
      undefined,
      undefined,
      { cursor: "", limit: 1000 },
    );
    const operations: Operation[] = page.results;
    expect(operations.map((op) => op.action.type)).toEqual(
      expect.arrayContaining([
        "CREATE_DOCUMENT",
        "UPGRADE_DOCUMENT",
        "SET_MODEL_NAME",
        "SET_MODEL_ID",
      ]),
    );
    const switchboardKey = reactor.renown?.signer.app?.key;
    const verify = createSignatureVerifier(true);
    for (const operation of operations) {
      const signer = operation.action.context?.signer;
      expect(signer?.user.address).toBe(person!.address);
      expect(signer?.app).toEqual({ name: LABEL, key: sessionKey });
      expect(signer?.signatures.at(-1)?.[1]).toBe(sessionKey);
      expect(signer?.app.key).not.toBe(switchboardKey);
      expect(await verify(operation, sessionKey)).toBe(true);
    }
  }, 120_000);
});
