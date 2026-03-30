import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ReactorClientModule } from "@powerhousedao/reactor";
import {
  ChannelScheme,
  driveCollectionId,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import {
  createClient,
  RemoteDocumentController,
} from "@powerhousedao/reactor-browser";
import { RenownBuilder } from "@renown/sdk/node";
import {
  driveDocumentModelModule,
  setDriveName,
} from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelDocument,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  DocumentModelController,
  documentModelDocumentModelModule,
  setModelDescription,
  setModelName,
} from "document-model";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const SWITCHBOARD_URL =
  process.env.SWITCHBOARD_URL ?? "http://localhost:4001/graphql";

const client = createClient(SWITCHBOARD_URL);

/** Track created document/drive IDs for cleanup. */
const createdDocumentIds: string[] = [];
let clientModule: ReactorClientModule | undefined;
let rejectDeadLetter: ((error: Error) => void) | undefined;
let deadLetterPromise: Promise<never> | undefined;

async function createDriveOnSwitchboard(name: string): Promise<string> {
  const result = await client.CreateEmptyDocument({
    documentType: "powerhouse/document-drive",
  });
  const driveId = result.createEmptyDocument.id;
  createdDocumentIds.push(driveId);

  // Set drive name
  await client.MutateDocument({
    documentIdentifier: driveId,
    actions: [setDriveName({ name })],
  });

  return driveId;
}

async function createLocalReactor(
  driveId: string,
): Promise<ReactorClientModule> {
  const renown = await new RenownBuilder("Test Local").build();

  const reactorBuilder = new ReactorBuilder()
    .withDocumentModels([
      driveDocumentModelModule,
      documentModelDocumentModelModule,
    ])
    .withChannelScheme(ChannelScheme.CONNECT)
    .withSignalHandlers();

  const module = await new ReactorClientBuilder()
    .withReactorBuilder(reactorBuilder)
    // .withSigner({ signer: renown.signer, verifier: createSignatureVerifier() })
    .buildModule();

  const sync = module.reactorModule?.syncModule?.syncManager;
  if (!sync) {
    throw new Error("Sync module not initialized");
  }

  const remoteName = crypto.randomUUID();
  const collectionId = driveCollectionId("main", driveId);

  const remote = await sync.add(remoteName, collectionId, {
    type: "gql",
    parameters: {
      url: SWITCHBOARD_URL,
    },
  });

  remote.channel.deadLetter.onAdded((syncOps) => {
    const error = syncOps.at(0)?.error;
    if (error) {
      console.error("FAILED");
      rejectDeadLetter?.(error);
    }
  });

  return module;
}

function initDeadLetterTrap() {
  deadLetterPromise = new Promise<never>((_, reject) => {
    rejectDeadLetter = reject;
  });
}

function raceDeadLetter<T>(promise: Promise<T>): Promise<T> {
  if (!deadLetterPromise) return promise;
  return Promise.race([promise, deadLetterPromise]);
}

function waitForSync<T>(fn: () => Promise<T>, timeout = 2000): Promise<T> {
  return raceDeadLetter(vi.waitFor(fn, { timeout }));
}

async function waitForDocument(
  module: ReactorClientModule,
  documentId: string,
  timeoutMs = 10_000,
): Promise<PHDocument> {
  return waitForSync(() => module.client.get(documentId), timeoutMs);
}

describe("Remote drive sync via CONNECT channel", () => {
  beforeEach(() => {
    initDeadLetterTrap();
  });

  afterEach(async () => {
    if (clientModule) {
      clientModule.reactorModule?.reactor.kill();
      clientModule = undefined;
    }
  });

  afterAll(async () => {
    for (const id of createdDocumentIds) {
      try {
        await client.DeleteDocument({ identifier: id });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it("creates a remote drive, syncs it locally, adds a document, and verifies sync", async () => {
    // 1. Create a drive on switchboard via GraphQL
    const driveId = await createDriveOnSwitchboard("E2E Remote Drive");

    // 2. Create a local reactor with CONNECT channel and add the remote drive
    clientModule = await createLocalReactor(driveId);

    // 3. Wait for the drive to sync locally
    await waitForDocument(clientModule, driveId);

    // 4. Create a document on switchboard inside the drive
    const createResult = await client.CreateEmptyDocument({
      documentType: "powerhouse/document-model",
      parentIdentifier: driveId,
    });
    const documentId = createResult.createEmptyDocument.id;
    createdDocumentIds.push(documentId);

    // 5. Mutate the document on switchboard
    await client.MutateDocument({
      documentIdentifier: documentId,
      actions: [
        setModelName({ name: "SyncedModel" }),
        setModelDescription({ description: "Synced from switchboard" }),
      ],
    });

    // 6. Wait for the document to sync to the local reactor
    await waitForDocument(clientModule, documentId);

    // 7. Poll until the operations are synced
    await waitForSync(async () => {
      const localDoc =
        await clientModule?.client.get<DocumentModelDocument>(documentId);
      const ops = await clientModule?.client.getOperations(documentId);
      expect(localDoc).toBeDefined();
      expect(ops).toBeDefined();
      expect(localDoc!.state.global.name).toBe("SyncedModel");
      expect(localDoc!.state.global.description).toBe(
        "Synced from switchboard",
      );
      expect(localDoc!.header.documentType).toBe("powerhouse/document-model");
    });
  });

  it("pushes local operations to the remote drive via sync", async () => {
    // 1. Create a drive on switchboard
    const driveId = await createDriveOnSwitchboard("E2E Push Drive");

    // 2. Create local reactor connected to the remote drive
    clientModule = await createLocalReactor(driveId);

    // 3. Wait for drive to sync
    await waitForDocument(clientModule, driveId);

    // 4. Create a document on switchboard so it syncs locally
    const createResult = await client.CreateEmptyDocument({
      documentType: "powerhouse/document-model",
      parentIdentifier: driveId,
    });
    const documentId = createResult.createEmptyDocument.id;
    createdDocumentIds.push(documentId);

    // 5. Wait for document to sync locally
    await waitForDocument(clientModule, documentId);

    // 6. Execute operations locally on the reactor
    await clientModule.client.execute(documentId, "main", [
      setModelName({ name: "LocallySetModel" }),
      setModelDescription({ description: "Set via local reactor" }),
    ]);

    const ops = await clientModule.client.getOperations(documentId);
    // 7. Wait for the local operations to sync to switchboard
    await waitForSync(async () => {
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId,
          mode: "batch",
        },
      );
      if (controller.state.global.name !== "LocallySetModel") {
        throw new Error("WAIT");
      }
      expect(controller.state.global.name).toBe("LocallySetModel");
      expect(controller.state.global.description).toBe("Set via local reactor");
    });
  });

  it("syncs multiple operations in sequence", async () => {
    // 1. Create drive and connect reactor
    const driveId = await createDriveOnSwitchboard("E2E Sequence Drive");
    clientModule = await createLocalReactor(driveId);
    await waitForDocument(clientModule, driveId);

    // 2. Create a document remotely
    const createResult = await client.CreateEmptyDocument({
      documentType: "powerhouse/document-model",
      parentIdentifier: driveId,
    });
    const documentId = createResult.createEmptyDocument.id;
    createdDocumentIds.push(documentId);

    // 3. Wait for it to sync
    await waitForDocument(clientModule, documentId);

    // 4. Apply multiple sequential mutations on switchboard
    for (let i = 1; i <= 3; i++) {
      await client.MutateDocument({
        documentIdentifier: documentId,
        actions: [setModelName({ name: `Iteration-${i}` })],
      });
    }

    // 5. Wait for the final state to sync
    await waitForSync(async () => {
      const localDoc =
        await clientModule?.client.get<DocumentModelDocument>(documentId);
      expect(localDoc).toBeDefined();
      expect(localDoc!.state.global.name).toBe("Iteration-3");
    });
  });

  it("adds operations via MCP and verifies sync to local reactor", async () => {
    const MCP_URL =
      process.env.SWITCHBOARD_MCP_URL ?? "http://localhost:4001/mcp";

    // 1. Connect MCP client
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
    const mcpClient = new Client({
      name: "switchboard-test",
      version: "1.0.0",
    });
    await mcpClient.connect(transport);

    try {
      // 2. Create a drive via MCP
      const addDriveResult = await mcpClient.callTool({
        name: "addDrive",
        arguments: {
          driveInput: { global: { name: "MCP Test Drive" } },
        },
      });
      const driveId = JSON.parse(
        (addDriveResult.content as Array<{ text: string }>)[0].text,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      ).driveId as string;
      createdDocumentIds.push(driveId);

      // 3. Create local reactor connected to the drive
      clientModule = await createLocalReactor(driveId);
      await waitForDocument(clientModule, driveId);

      // 4. Create a document via MCP inside the drive
      const createDocResult = await mcpClient.callTool({
        name: "createDocument",
        arguments: {
          documentType: "powerhouse/document-model",
          name: "MCP Doc",
          driveId,
        },
      });
      const documentId = JSON.parse(
        (createDocResult.content as Array<{ text: string }>)[0].text,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      ).documentId as string;
      createdDocumentIds.push(documentId);

      // 5. Add actions via MCP
      const addActionsResult = await mcpClient.callTool({
        name: "addActions",
        arguments: {
          documentId,
          actions: [
            {
              type: "SET_MODEL_NAME",
              input: { name: "McpModel" },
              scope: "global",
            },
            {
              type: "SET_MODEL_DESCRIPTION",
              input: { description: "Created via MCP" },
              scope: "global",
            },
          ],
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const addActionsOutput = JSON.parse(
        (addActionsResult.content as Array<{ text: string }>)[0].text,
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(addActionsOutput.success).toBe(true);

      // 6. Wait for the document to sync to the local reactor
      await waitForDocument(clientModule, documentId);

      await waitForSync(async () => {
        const localDoc =
          await clientModule?.client.get<DocumentModelDocument>(documentId);
        expect(localDoc).toBeDefined();
        expect(localDoc!.state.global.name).toBe("McpModel");
        expect(localDoc!.state.global.description).toBe("Created via MCP");
      });
    } finally {
      await mcpClient.close();
    }
  });
});
