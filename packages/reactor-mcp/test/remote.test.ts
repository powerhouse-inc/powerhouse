import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  baseDocumentModels,
  createRemoteServer,
  localDocumentModels,
  type CreateRemoteServerOptions,
} from "../src/remote.js";
import { createP256Signer } from "./utils/p256-signer.js";

// The remote tools over a client that only reads and writes, as
// reactor-browser's GraphQL client does: the in-process client stands in.

const DRIVE = "remote-drive";

let module: InProcessReactorClientModule;

beforeEach(async () => {
  module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        documentModelDocumentModelModule as unknown as DocumentModelModule,
        driveDocumentModelModule as unknown as DocumentModelModule,
      ]),
    )
    .withSigner(await createP256Signer())
    .buildModule();
  // A fixed id cannot be content-addressed, so the drive is legacy.
  await module.client.create(
    withSignaturePolicy(
      driveDocumentModelModule.utils.createDocument(),
      "legacy",
      {
        id: DRIVE,
      },
    ),
  );
});

afterEach(() => {
  module.reactor.kill();
});

async function connect(
  options: Omit<CreateRemoteServerOptions, "client">,
): Promise<Client> {
  const server = createRemoteServer({ client: module.client, ...options });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

describe("createRemoteServer", () => {
  it("creates a document filed in a drive, each write through the client", async () => {
    let writes = 0;
    const client = await connect({
      documentModels: () => baseDocumentModels,
      onWrite: () => {
        writes++;
      },
    });
    const created = await call(client, "createDocument", {
      documentType: "powerhouse/document-model",
      name: "Filed",
      driveId: DRIVE,
    });
    expect(created.isError).toBeFalsy();
    const { documentId } = created.structuredContent as { documentId: string };
    expect(writes).toBeGreaterThan(0);

    const drive = await module.client.get<DocumentDriveDocument>(DRIVE);
    expect(drive.state.global.nodes.map((node) => node.id)).toContain(
      documentId,
    );
    const children = await module.client.getOutgoingRelationships(
      DRIVE,
      "child",
    );
    expect(children.results.map((child) => child.header.id)).toContain(
      documentId,
    );

    const added = await call(client, "addActions", {
      documentId,
      actions: [
        { type: "SET_MODEL_NAME", input: { name: "One" } },
        { type: "SET_MODEL_ID", input: { id: "test/one" } },
      ],
    });
    expect(added.isError).toBeFalsy();
    expect((added.structuredContent as { success: boolean }).success).toBe(
      true,
    );
  });

  it("adds and deletes a drive, each write through the client", async () => {
    let writes = 0;
    const client = await connect({
      documentModels: () => baseDocumentModels,
      onWrite: () => {
        writes++;
      },
    });
    const added = await call(client, "addDrive", {
      name: "Remote Drive",
      icon: "r",
      preferredEditor: "app",
    });
    expect(added.isError, JSON.stringify(added.content)).toBeFalsy();
    const { driveId } = added.structuredContent as { driveId: string };
    expect(writes).toBeGreaterThan(0);
    const drive = await module.client.get<DocumentDriveDocument>(driveId);
    expect(drive.header.name).toBe("Remote Drive");
    expect(drive.header.meta?.preferredEditor).toBe("app");
    expect(drive.state.global.name).toBe("Remote Drive");
    expect(drive.state.global.icon).toBe("r");

    const deleted = await call(client, "deleteDrive", { documentId: driveId });
    expect(deleted.isError, JSON.stringify(deleted.content)).toBeFalsy();
    await expect(module.client.get(driveId)).rejects.toThrow();
  });

  it("names a model it does not hold before it writes anything", async () => {
    const missing: string[] = [];
    let writes = 0;
    const client = await connect({
      documentModels: () => [],
      onMissingModel: (type) => missing.push(type),
      onWrite: () => {
        writes++;
      },
    });
    const result = await call(client, "createDocument", {
      documentType: "powerhouse/document-model",
    });
    expect(result.isError).toBe(true);
    expect(missing).toEqual(["powerhouse/document-model"]);
    expect(writes).toBe(0);
  });
});

describe("localDocumentModels", () => {
  it("holds the base models, and starts nothing without a models folder", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "remote-models-"));
    try {
      const models = await localDocumentModels(root);
      expect(models.current()).toEqual(baseDocumentModels);
      await models.close();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
