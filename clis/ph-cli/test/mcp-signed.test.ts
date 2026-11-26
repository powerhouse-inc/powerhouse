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
// A package of models neither `ph mcp` nor the switchboard has by itself.
const MODELS_PACKAGE = path.resolve(here, "../../../packages/vetra");
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
  fs.writeFileSync(
    path.join(project, "powerhouse.config.json"),
    JSON.stringify({
      packages: [{ packageName: MODELS_PACKAGE, provider: "local" }],
    }),
  );

  const started = await startSwitchboard(
    {
      server: { port: 0, host: "127.0.0.1" },
      storage: { inMemory: true, userDataDir: project },
      features: { workflows: false, mcp: true },
      packages: { disableLocal: true, list: [MODELS_PACKAGE] },
      identity: {
        keypairPath: path.join(root, "switchboard", ".keypair.json"),
        storagePath: path.join(root, "switchboard", ".renown.json"),
      },
      protocol: { createSignaturePolicy: "legacy" },
      // A drive to file documents in, which the host itself creates.
      drive: { slug: "vetra", global: { name: "Vetra" } },
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

/** Every operation of `documentId`, all scopes. */
async function operationsOf(documentId: string): Promise<Operation[]> {
  const page = await switchboard!.reactor.getOperations(
    documentId,
    undefined,
    undefined,
    { cursor: "", limit: 1000 },
  );
  return page.results;
}

/** The pseudonym and the session key the client signs with. */
function signerOfClient(): { address: string; sessionKey: string } {
  const person = readActiveIdentity({
    dataDir: project,
    env: { PH_IDENTITY_HOME: home },
  });
  const [record] = listCredentialRecords({ dataDir: project });
  return { address: person!.address, sessionKey: record!.sessionDid };
}

/** Each operation names the client's session, verifies against its key, and none is the host's. */
async function expectSignedByClient(operations: Operation[]): Promise<void> {
  const { address, sessionKey } = signerOfClient();
  const switchboardKey = switchboard!.renown?.signer.app?.key;
  const verify = createSignatureVerifier(true);
  for (const operation of operations) {
    const signer = operation.action.context?.signer;
    expect(signer?.user.address).toBe(address);
    expect(signer?.app).toEqual({ name: LABEL, key: sessionKey });
    expect(signer?.signatures.at(-1)?.[1]).toBe(sessionKey);
    expect(signer?.app.key).not.toBe(switchboardKey);
    expect(await verify(operation, sessionKey)).toBe(true);
  }
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
    expect(listCredentialRecords({ dataDir: project })).toMatchObject([
      { address: person!.address.toLowerCase(), label: LABEL, source: "cli" },
    ]);
    expect(
      fs.existsSync(
        path.join(project, ".ph", "sessions", "mcp-test-client.json"),
      ),
    ).toBe(true);

    const operations = await operationsOf(documentId);
    expect(operations.map((op) => op.action.type)).toEqual(
      expect.arrayContaining([
        "CREATE_DOCUMENT",
        "UPGRADE_DOCUMENT",
        "SET_MODEL_NAME",
        "SET_MODEL_ID",
      ]),
    );
    await expectSignedByClient(operations);
  }, 120_000);

  it("files a document in a drive with every write signed by the client's session", async () => {
    const created = await call("createDocument", {
      documentType: "powerhouse/document-model",
      name: "Filed Model",
      driveId: "vetra",
    });
    const { documentId } = created.structuredContent as { documentId: string };
    await expectSignedByClient(await operationsOf(documentId));

    const drive = await switchboard!.reactor.get("vetra");
    const filing = (await operationsOf(drive.header.id)).filter(
      (op) =>
        (op.action.type === "ADD_FILE" &&
          (op.action.input as { id?: string }).id === documentId) ||
        (op.action.type === "ADD_RELATIONSHIP" &&
          (op.action.input as { targetId?: string }).targetId === documentId),
    );
    expect(filing.map((op) => op.action.type).sort()).toEqual([
      "ADD_FILE",
      "ADD_RELATIONSHIP",
    ]);
    await expectSignedByClient(filing);
  }, 120_000);

  it("deletes a filed document by its own signed DELETE_DOCUMENT, which the switchboard completes", async () => {
    const created = await call("createDocument", {
      documentType: "powerhouse/document-model",
      name: "Deleted Model",
      driveId: "vetra",
    });
    const { documentId } = created.structuredContent as { documentId: string };
    await call("deleteDocument", { documentId });

    const drive = await switchboard!.reactor.get("vetra");
    const driveOperations = await operationsOf(drive.header.id);
    const unfiled = driveOperations.filter(
      (op) =>
        (op.action.type === "DELETE_NODE" &&
          (op.action.input as { id?: string }).id === documentId) ||
        (op.action.type === "REMOVE_RELATIONSHIP" &&
          (op.action.input as { targetId?: string }).targetId === documentId),
    );
    expect(unfiled.map((op) => op.action.type).sort()).toEqual([
      "DELETE_NODE",
      "REMOVE_RELATIONSHIP",
    ]);
    // The tool unfiles the node itself; the link into the document is the
    // switchboard's own work, under an id derived from the signed delete.
    await expectSignedByClient(
      unfiled.filter((op) => op.action.type === "DELETE_NODE"),
    );
    const removal = unfiled.find(
      (op) => op.action.type === "REMOVE_RELATIONSHIP",
    )!;
    const switchboardKey = switchboard!.renown?.signer.app?.key;
    expect(removal.action.context?.signer?.app.key).toBe(switchboardKey);
    // Derived from the signed delete's id, not generated.
    expect(removal.action.id).toMatch(/^[0-9a-f]{32}$/);
    await expect(switchboard!.reactor.get(documentId)).rejects.toThrow();
  }, 120_000);

  it("creates a document of a model a package of the project's config provides", async () => {
    const created = await call("createDocument", {
      documentType: "powerhouse/package",
      name: "Packaged",
    });
    const { documentId } = created.structuredContent as { documentId: string };
    await expectSignedByClient(await operationsOf(documentId));
  }, 120_000);

  it("answers a model nothing provides with a tool error naming it, writing nothing", async () => {
    const result = (await client!.callTool({
      name: "createDocument",
      arguments: { documentType: "test/nobody-provides-this", name: "None" },
    })) as CallToolResult;
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      "holds no document model test/nobody-provides-this",
    );
  }, 120_000);
});
