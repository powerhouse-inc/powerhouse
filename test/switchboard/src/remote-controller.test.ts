import type { ConflictInfo } from "@powerhousedao/reactor-browser";
import {
  ConflictError,
  createClient,
  RemoteDocumentController,
} from "@powerhousedao/reactor-browser";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/node";
import { DocumentModelController } from "document-model";
import { afterAll, describe, expect, it } from "vitest";

const SWITCHBOARD_URL =
  process.env.SWITCHBOARD_URL ?? "http://localhost:4001/graphql";

const DRIVE_ID = process.env.SWITCHBOARD_DRIVE_ID ?? "powerhouse";

const client = createClient(SWITCHBOARD_URL);

/** Track created document IDs for cleanup. */
const createdDocumentIds: string[] = [];

describe("RemoteDocumentController e2e", () => {
  afterAll(async () => {
    // Clean up created documents
    for (const id of createdDocumentIds) {
      try {
        await client.DeleteDocument({ identifier: id });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it("creates a new document, pushes actions, and verifies state", async () => {
    // Create a controller for a new document (no documentId)
    const controller = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,

        mode: "batch",
        parentIdentifier: DRIVE_ID,
      },
    );

    expect(controller.status.connected).toBe(false);
    expect(controller.status.pendingActionCount).toBe(0);

    // Apply a local action
    controller.setName({ name: "E2E Test Document" });
    expect(controller.status.pendingActionCount).toBe(1);
    expect(controller.header.name).toBe("E2E Test Document");

    // Push to remote (creates document + pushes action)
    const result = await controller.push();

    expect(result.actionCount).toBe(1);
    expect(controller.status.connected).toBe(true);
    expect(controller.status.pendingActionCount).toBe(0);

    const documentId = controller.status.documentId;
    expect(documentId).toBeTruthy();
    createdDocumentIds.push(documentId);

    // Verify the remote has the correct name
    expect(controller.header.name).toBe("E2E Test Document");
  });

  it("pulls an existing document and reads its state", async () => {
    // First create a document to pull
    const createResult = await client.CreateEmptyDocument({
      documentType: "powerhouse/document-model",
      parentIdentifier: DRIVE_ID,
    });
    const docId = createResult.createEmptyDocument.id;
    createdDocumentIds.push(docId);

    // Mutate it directly via GraphQL
    await client.MutateDocument({
      documentIdentifier: docId,
      actions: [
        {
          type: "SET_NAME",
          input: { name: "Pulled Document" },
          scope: "global",
          id: crypto.randomUUID(),
          timestampUtcMs: new Date().toISOString(),
        },
      ],
    });

    // Pull via RemoteDocumentController
    const controller = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        documentId: docId,
        mode: "batch",
      },
    );

    expect(controller.status.connected).toBe(true);
    expect(controller.status.documentId).toBe(docId);
    expect(controller.header.name).toBe("Pulled Document");
  });

  it("chains multiple actions and pushes them in a single batch", async () => {
    const controller = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,

        mode: "batch",
        parentIdentifier: DRIVE_ID,
      },
    );

    // Chain multiple actions
    controller
      .setName({ name: "Batch Test" })
      .setModelName({ name: "BatchModel" })
      .setModelDescription({ description: "A batch-created model" });

    expect(controller.status.pendingActionCount).toBe(3);

    // Push all at once
    const result = await controller.push();

    expect(result.actionCount).toBe(3);
    expect(controller.status.pendingActionCount).toBe(0);
    createdDocumentIds.push(controller.status.documentId);

    // Verify final state
    expect(controller.header.name).toBe("Batch Test");
  });

  it("wraps an existing local controller with RemoteDocumentController.from", async () => {
    // Create and configure a local controller
    const local = new DocumentModelController();
    local.setName({ name: "From Local" });

    // Wrap with remote capabilities
    const remote = RemoteDocumentController.from(local, {
      client,

      mode: "batch",
      parentIdentifier: DRIVE_ID,
    });

    // Pre-existing actions are not tracked
    expect(remote.status.pendingActionCount).toBe(0);
    expect(remote.header.name).toBe("From Local");

    // Add a new action through the remote controller
    remote.setModelName({ name: "RemoteModel" });
    expect(remote.status.pendingActionCount).toBe(1);

    // Push creates document on remote + pushes action
    const result = await remote.push();

    expect(result.actionCount).toBe(1);
    expect(remote.status.connected).toBe(true);
    createdDocumentIds.push(remote.status.documentId);
  });

  it("push then pull roundtrip preserves state", async () => {
    // Create and push a document
    const controller1 = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,

        mode: "batch",
        parentIdentifier: DRIVE_ID,
      },
    );

    controller1
      .setName({ name: "Roundtrip Test" })
      .setModelDescription({ description: "Initial description" });
    await controller1.push();
    const docId = controller1.status.documentId;
    createdDocumentIds.push(docId);

    expect(controller1.header.name).toBe("Roundtrip Test");

    // Pull the same document with a new controller instance
    const controller2 = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        documentId: docId,
        mode: "batch",
      },
    );

    expect(controller2.header.name).toBe("Roundtrip Test");
    expect(controller2.status.documentId).toBe(docId);
    expect(controller2.state.global.description).toBe("Initial description");

    // Push state changes from the second controller
    controller2.setModelDescription({
      description: "Updated via Controller 2",
    });
    await controller2.push();

    // Pull from the first controller to see the update
    await controller1.pull();
    expect(controller1.state.global.description).toBe(
      "Updated via Controller 2",
    );
  });

  it("second SET_NAME after push correctly sends SET_NAME (not UPGRADE_DOCUMENT)", async () => {
    const controller = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,

        mode: "batch",
        parentIdentifier: DRIVE_ID,
      },
    );

    // First push: creates document + SET_NAME — works correctly
    controller.setName({ name: "First Name" });
    await controller.push();
    const docId = controller.status.documentId;
    createdDocumentIds.push(docId);
    expect(controller.header.name).toBe("First Name");

    // Second push: SET_NAME should update the name
    controller.setName({ name: "Second Name" });
    await controller.push();

    expect(controller.header.name).toBe("Second Name");
  });

  it("signed actions preserve signatures after push and pull", async () => {
    const testUser = {
      address: "0x9aDdcBbaA28F7eB5f75E023F7C1Fcb13C9DFD8F7",
      networkId: "eip155",
      chainId: 1,
    };

    const keyStorage = new MemoryKeyStorage();
    const renownCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(keyStorage)
      .build();
    const signer = new RenownCryptoSigner(renownCrypto, "e2e-test", testUser);

    // Create a controller with a signer
    const controller = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,

        mode: "batch",
        parentIdentifier: DRIVE_ID,
        signer,
      },
    );

    controller.setName({ name: "Signed Document" });
    const result = await controller.push();
    const docId = controller.status.documentId;
    createdDocumentIds.push(docId);

    // Get the signature that was actually pushed (ground truth)
    expect(result.operations).toHaveLength(1);
    const pushedAction = result.operations[0];
    const pushedSigner = pushedAction.context?.signer;
    expect(pushedSigner).toBeDefined();
    const pushedSignature = pushedSigner!.signatures[0];

    // Pull the same document with a fresh controller
    const pulled = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        documentId: docId,
        mode: "batch",
      },
    );

    // Find the SET_NAME operation in global scope
    const globalOps = pulled.operations["global"];
    expect(globalOps).toBeDefined();

    const setNameOp = globalOps!.find((op) => op.action.type === "SET_NAME");
    expect(setNameOp).toBeDefined();

    // Verify signer identity matches what was pushed
    const pulledSigner = setNameOp!.action.context?.signer;
    expect(pulledSigner).toBeDefined();
    expect(pulledSigner!.app).toStrictEqual(pushedSigner!.app);
    expect(pulledSigner!.user).toStrictEqual(pushedSigner!.user);
    expect(pulledSigner!.signatures).toHaveLength(1);

    // Signature elements should be identical to what was pushed
    const pulledSignature = pulledSigner!.signatures[0];
    expect(pulledSignature).toEqual(pushedSignature);
  });

  it("reports correct remote revision after push", async () => {
    const controller = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,

        mode: "batch",
        parentIdentifier: DRIVE_ID,
      },
    );

    controller.setName({ name: "Revision Test" });
    await controller.push();
    createdDocumentIds.push(controller.status.documentId);

    const revision = controller.status.remoteRevision;
    expect(revision).toBeDefined();
    // After one action in the global scope, revision should be > 0
    expect(revision["global"]).toBeGreaterThan(0);
  });

  // --- Conflict detection tests ---

  it("reject strategy: throws ConflictError when remote has new operations", async () => {
    // Controller A creates a document and pushes
    const controllerA = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        mode: "batch",
        parentIdentifier: DRIVE_ID,
      },
    );

    controllerA.setName({ name: "Conflict Test" });
    await controllerA.push();
    const docId = controllerA.status.documentId;
    createdDocumentIds.push(docId);

    // Controller B pulls the same document with reject strategy
    const controllerB = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        documentId: docId,
        mode: "batch",
        onConflict: "reject",
      },
    );

    // Controller A pushes a change
    controllerA.setModelDescription({ description: "A's change" });
    await controllerA.push();

    // Controller B makes a local change and tries to push — should fail
    controllerB.setModelDescription({ description: "B's change" });

    let caughtError: ConflictError | undefined;
    try {
      await controllerB.push();
    } catch (err) {
      caughtError = err as ConflictError;
    }

    expect(caughtError).toBeInstanceOf(ConflictError);
    expect(caughtError!.conflict).toBeDefined();
    expect(caughtError!.conflict.localActions).toHaveLength(1);
    expect(caughtError!.conflict.currentRevision["global"]).toBeGreaterThan(
      caughtError!.conflict.knownRevision["global"] ?? 0,
    );
  });

  it("rebase strategy: rebases local actions on top of remote changes", async () => {
    // Controller A creates a document and pushes
    const controllerA = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        mode: "batch",
        parentIdentifier: DRIVE_ID,
      },
    );

    controllerA.setName({ name: "Rebase Test" });
    await controllerA.push();
    const docId = controllerA.status.documentId;
    createdDocumentIds.push(docId);

    // Controller B pulls the same document with rebase strategy
    const controllerB = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        documentId: docId,
        mode: "batch",
        onConflict: "rebase",
      },
    );

    // Controller A pushes a change (description)
    controllerA.setModelDescription({ description: "A's description" });
    await controllerA.push();

    // Controller B makes a different change (name) and pushes — should rebase
    controllerB.setName({ name: "B's Name" });
    const result = await controllerB.push();

    expect(result.actionCount).toBe(1);

    // Both changes should be present in the final state
    expect(controllerB.header.name).toBe("B's Name");
    expect(controllerB.state.global.description).toBe("A's description");
  });

  it("merge callback: custom handler receives conflict info and resolves", async () => {
    // Controller A creates a document and pushes
    const controllerA = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        mode: "batch",
        parentIdentifier: DRIVE_ID,
      },
    );

    controllerA.setName({ name: "Merge Test" });
    await controllerA.push();
    const docId = controllerA.status.documentId;
    createdDocumentIds.push(docId);

    let receivedConflict: ConflictInfo | undefined;

    // Controller B pulls with a custom merge handler
    const controllerB = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        documentId: docId,
        mode: "batch",
        onConflict: (conflict) => {
          receivedConflict = conflict;
          // Return a merged action: use a combined name
          return [
            {
              type: "SET_NAME",
              input: { name: "Merged Name" },
              scope: "global",
              id: crypto.randomUUID(),
              timestampUtcMs: Date.now().toString(),
            },
          ];
        },
      },
    );

    // Controller A pushes a change
    controllerA.setModelDescription({ description: "A's description" });
    await controllerA.push();

    // Controller B makes a local change and pushes with merge
    controllerB.setName({ name: "B's Name" });
    const result = await controllerB.push();

    // Merge handler should have been called
    expect(receivedConflict).toBeDefined();
    expect(receivedConflict!.localActions).toHaveLength(1);

    // The merged action should have been applied
    expect(result.actionCount).toBe(1);
    expect(controllerB.header.name).toBe("Merged Name");
    expect(controllerB.state.global.description).toBe("A's description");
  });

  it("reject strategy: conflict info contains only operations since last pull for conflicting scope", async () => {
    // Controller A creates a document and pushes two actions
    const controllerA = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        mode: "batch",
        parentIdentifier: DRIVE_ID,
      },
    );

    controllerA.setName({ name: "Scope Test" });
    controllerA.setModelDescription({ description: "Initial" });
    await controllerA.push();
    const docId = controllerA.status.documentId;
    createdDocumentIds.push(docId);

    // Controller B pulls — knows the current revision
    const controllerB = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        documentId: docId,
        mode: "batch",
        onConflict: "reject",
      },
    );

    const knownRevision = controllerB.status.remoteRevision["global"] ?? 0;
    expect(knownRevision).toBeGreaterThan(0);

    // Controller A pushes more actions (advances remote past B's known revision)
    controllerA.setModelDescription({ description: "A's update 1" });
    controllerA.setModelDescription({ description: "A's update 2" });
    await controllerA.push();

    // Controller B makes a local change and tries to push — should fail with conflict
    controllerB.setName({ name: "B's change" });

    let caughtError: ConflictError | undefined;
    try {
      await controllerB.push();
    } catch (err) {
      caughtError = err as ConflictError;
    }

    expect(caughtError).toBeInstanceOf(ConflictError);
    const conflict = caughtError!.conflict;

    // Conflict should only contain global scope operations
    expect(Object.keys(conflict.remoteOperations)).toEqual(["global"]);

    // Remote operations should only be those added after B's known revision
    const remoteOps = conflict.remoteOperations["global"]!;
    expect(remoteOps.length).toBeGreaterThan(0);
    for (const op of remoteOps) {
      expect(op.index).toBeGreaterThanOrEqual(knownRevision);
    }
  });

  it("incremental pull fetches only new operations via cursor", async () => {
    // Create a document and push initial actions
    const controllerA = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        mode: "batch",
        parentIdentifier: DRIVE_ID,
      },
    );

    controllerA.setName({ name: "Cursor Test" });
    controllerA.setModelDescription({ description: "Initial" });
    await controllerA.push();
    const docId = controllerA.status.documentId;
    createdDocumentIds.push(docId);

    // Pull the document — establishes cursor
    const controllerB = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        documentId: docId,
        mode: "batch",
      },
    );

    const opsAfterFirstPull = controllerB.operations["global"]?.length ?? 0;
    expect(opsAfterFirstPull).toBeGreaterThan(0);

    // Controller A pushes more actions
    controllerA.setModelDescription({ description: "Update 1" });
    controllerA.setModelDescription({ description: "Update 2" });
    await controllerA.push();

    // Controller B pulls again — should use cursor for incremental fetch
    await controllerB.pull();

    const opsAfterSecondPull = controllerB.operations["global"]?.length ?? 0;
    // Should have the original ops + 2 new ones
    expect(opsAfterSecondPull).toBe(opsAfterFirstPull + 2);
    expect(controllerB.state.global.description).toBe("Update 2");
  });

  it("multiple push-pull cycles accumulate operations correctly", async () => {
    const controller = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        mode: "batch",
        parentIdentifier: DRIVE_ID,
      },
    );

    // Cycle 1: push initial actions
    controller.setName({ name: "Multi-cycle Test" });
    controller.setModelDescription({ description: "Cycle 1" });
    await controller.push();
    createdDocumentIds.push(controller.status.documentId);

    const opsAfterCycle1 = controller.operations["global"]?.length ?? 0;

    // Cycle 2: push more actions (pull happens inside push)
    controller.setModelDescription({ description: "Cycle 2" });
    controller.setModelName({ name: "CycleModel" });
    await controller.push();

    const opsAfterCycle2 = controller.operations["global"]?.length ?? 0;
    expect(opsAfterCycle2).toBe(opsAfterCycle1 + 2);

    // Cycle 3: one more push
    controller.setModelDescription({ description: "Cycle 3" });
    await controller.push();

    const opsAfterCycle3 = controller.operations["global"]?.length ?? 0;
    expect(opsAfterCycle3).toBe(opsAfterCycle2 + 1);

    // Verify final state is correct
    expect(controller.header.name).toBe("Multi-cycle Test");
    expect(controller.state.global.description).toBe("Cycle 3");
    expect(controller.state.global.name).toBe("CycleModel");

    // Fresh pull should have the same operation count
    const fresh = await RemoteDocumentController.pull(DocumentModelController, {
      client,
      documentId: controller.status.documentId,
      mode: "batch",
    });
    expect(fresh.operations["global"]?.length).toBe(opsAfterCycle3);
  });

  it("paginates through multiple pages of operations with small page size", async () => {
    // Use a page size of 2 so that 5 operations require multiple pages
    const controller = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        mode: "batch",
        parentIdentifier: DRIVE_ID,
        operationsPageSize: 2,
      },
    );

    // Push 5 actions — with pageSize=2, this requires 3 pages to fetch
    controller.setName({ name: "Pagination Test" });
    controller.setModelName({ name: "PageModel" });
    controller.setModelDescription({ description: "Desc 1" });
    controller.setModelDescription({ description: "Desc 2" });
    controller.setModelDescription({ description: "Desc 3" });
    await controller.push();
    const docId = controller.status.documentId;
    createdDocumentIds.push(docId);

    // The push triggers a pull internally. Verify all ops came through.
    const globalOps = controller.operations["global"];
    expect(globalOps).toBeDefined();
    // The server may add extra operations (e.g. UPGRADE_DOCUMENT),
    // so we check at least 5 operations were fetched.
    expect(globalOps!.length).toBeGreaterThanOrEqual(5);

    // Verify final state is correct (all actions applied)
    expect(controller.header.name).toBe("Pagination Test");
    expect(controller.state.global.name).toBe("PageModel");
    expect(controller.state.global.description).toBe("Desc 3");

    // Fresh pull with small page size should produce the same result
    const fresh = await RemoteDocumentController.pull(DocumentModelController, {
      client,
      documentId: docId,
      mode: "batch",
      operationsPageSize: 2,
    });
    expect(fresh.operations["global"]?.length).toBe(globalOps!.length);
    expect(fresh.header.name).toBe("Pagination Test");
    expect(fresh.state.global.description).toBe("Desc 3");
  });

  it("incremental pull with small page size fetches and merges correctly", async () => {
    // Create a document with a small page size
    const controllerA = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        mode: "batch",
        parentIdentifier: DRIVE_ID,
        operationsPageSize: 2,
      },
    );

    controllerA.setName({ name: "Incremental Page Test" });
    controllerA.setModelDescription({ description: "Initial" });
    await controllerA.push();
    const docId = controllerA.status.documentId;
    createdDocumentIds.push(docId);

    // Pull with small page size — establishes cursor
    const controllerB = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        documentId: docId,
        mode: "batch",
        operationsPageSize: 2,
      },
    );

    const opsAfterFirstPull = controllerB.operations["global"]?.length ?? 0;
    expect(opsAfterFirstPull).toBeGreaterThan(0);

    // Push 3 more actions from A (requires 2 pages with pageSize=2)
    controllerA.setModelDescription({ description: "Update 1" });
    controllerA.setModelDescription({ description: "Update 2" });
    controllerA.setModelDescription({ description: "Update 3" });
    await controllerA.push();

    // Incremental pull from B — fetches new ops (possibly multi-page) and merges
    await controllerB.pull();

    const opsAfterSecondPull = controllerB.operations["global"]?.length ?? 0;
    expect(opsAfterSecondPull).toBe(opsAfterFirstPull + 3);
    expect(controllerB.state.global.description).toBe("Update 3");
  });

  it("no conflict when onConflict is set but remote has not changed", async () => {
    // Controller A creates a document and pushes
    const controllerA = await RemoteDocumentController.pull(
      DocumentModelController,
      {
        client,
        mode: "batch",
        parentIdentifier: DRIVE_ID,
        onConflict: "reject",
      },
    );

    controllerA.setName({ name: "No Conflict Test" });
    await controllerA.push();
    createdDocumentIds.push(controllerA.status.documentId);

    await controllerA.pull();

    // Push another action — no one else has changed the doc, so no conflict
    controllerA.setModelDescription({ description: "Second push" });
    const result = await controllerA.push();

    expect(result.actionCount).toBe(1);
    expect(controllerA.state.global.description).toBe("Second push");
  });
});
