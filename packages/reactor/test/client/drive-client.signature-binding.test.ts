import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import {
  expectedActionHashes,
  hashActionV2,
  signatureScheme,
  SIGNATURE_SCHEME_V2,
  type Action,
  type ActionSigningContext,
  type AppActionSigner,
  type ISigner,
  type Signature,
  type UserActionSigner,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SignatureVerifier } from "../../src/executor/signature-verifier.js";
import type { IReactorClient } from "../../src/client/types.js";
import { addRelationshipAction } from "../../src/actions/index.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import type { SignatureVerificationHandler } from "../../src/signer/types.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import type { Database } from "../../src/core/types.js";
import type { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import {
  createTestDocumentIndexer,
  createTestOperationStore,
} from "../factories.js";

/**
 * #2894 - addFile used to sign its CREATE, UPGRADE and ADD_RELATIONSHIP
 * actions as one batch stamped with the new document's id. The relationship
 * is applied to the drive, but a load of the drive verifies against the
 * drive's id, so the stamped signature matched no candidate and the drive
 * dead-lettered on every load (package-e2e "drive + document + edits
 * propagate via switchboard").
 *
 * The signer and verifier below implement the exact protocol the production
 * pair uses (RenownCryptoSigner / createSignatureVerifier): the hash field is
 * {@link hashActionV2} over the document id the signer was handed plus the
 * action's scope, type, id, nonce, timestamp and input, and the verifier
 * recomputes {@link expectedActionHashes} from the action being verified
 * instead of trusting the tuple. The ECDSA layer is replaced by a fixed
 * dummy, because what is under test is the hash binding.
 */

const KEY = "did:key:zBindingTest";
const DUMMY_SIGNATURE = "0x" + "ab".repeat(32);

function createBindingSigner(): ISigner {
  const app: AppActionSigner = { name: "binding-test", key: KEY };
  const user: UserActionSigner = {
    address: "0x0",
    chainId: 0,
    networkId: "eip155",
  };
  return {
    app,
    user,
    publicKey: {} as CryptoKey,
    sign: () => Promise.resolve(new Uint8Array(0)),
    verify: () => Promise.resolve(undefined),
    signAction: async (
      action: Action,
      context: ActionSigningContext,
    ): Promise<Signature> => {
      const hash = await hashActionV2(context.documentId, action);
      return [
        String(Math.floor(Date.now() / 1000)),
        KEY,
        hash,
        "",
        DUMMY_SIGNATURE,
        SIGNATURE_SCHEME_V2,
      ];
    },
  };
}

function createBindingVerifier(): SignatureVerificationHandler {
  return async (operation, publicKey, context) => {
    const action: Action | undefined = operation.action;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `action` is required by the type but can be absent at runtime
    if (!action?.context?.signer || !publicKey) {
      return true;
    }
    const signatures = action.context.signer.signatures;
    if (signatures.length === 0) {
      return false;
    }
    const signature = signatures[signatures.length - 1];
    const [, signerKey, hash] = signature;
    if (signerKey !== publicKey) {
      return false;
    }
    const expected = await expectedActionHashes(
      signatureScheme(signature),
      context?.documentId ?? "",
      action,
    );
    return expected.includes(hash);
  };
}
describe("DriveClient.addFile signature binding (#2894)", () => {
  let client: IReactorClient;
  let reactor: IReactor;
  let store: KyselyOperationStore;
  let eventBus: IEventBus;
  let verifier: SignatureVerificationHandler;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    store = setup.store;
    cleanup = setup.cleanup;
    const db = setup.db as unknown as Kysely<Database>;

    eventBus = new EventBus();
    const tracker = new ConsistencyTracker();
    const documentIndexer = createTestDocumentIndexer(db, tracker);
    await documentIndexer.init();

    verifier = createBindingVerifier();
    const reactorBuilder = new ReactorBuilder()
      .withKysely(db)
      .withMigrationStrategy("none")
      .withDocumentModelSources([
        driveDocumentModelModule as any,
        documentModelDocumentModelModule,
      ])
      .withReadModel(documentIndexer)
      .withEventBus(eventBus)
      .withSignatureVerifier(verifier);
    client = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .withSigner(createBindingSigner())
      .build();
    reactor = (client as any).reactor;
  });

  afterEach(async () => {
    reactor.kill();
    await cleanup();
  });

  async function createDrive(): Promise<DocumentDriveDocument> {
    return client.drives.create({ global: { name: "Drive" } });
  }

  it("a drive loaded after addFile verifies every stored operation", async () => {
    const drive = await createDrive();
    const doc = documentModelDocumentModelModule.utils.createDocument();
    doc.header.name = "Doc";
    await client.drives.addFile(drive.header.id, doc);

    const sv = new SignatureVerifier(verifier);

    // The document-scope operations the CI load job carried: the drive's
    // CREATE, UPGRADE and the drive->doc ADD_RELATIONSHIP. Before the fix the
    // relationship was stamped with the new document's id and this threw
    // "Invalid signature in document <drive>: Action ... signature
    // verification returned false".
    const driveDocOps = (
      await store.getSince(drive.header.id, "document", "main", -1)
    ).results;
    expect(driveDocOps.map((o) => o.action.type)).toEqual([
      "CREATE_DOCUMENT",
      "UPGRADE_DOCUMENT",
      "ADD_RELATIONSHIP",
    ]);
    await sv.verifyActions(
      drive.header.id,
      "main",
      driveDocOps.map((o) => o.action),
    );

    // The file node lands in the drive's global scope: it must verify there,
    // bound to the drive.
    const driveGlobalOps = (
      await store.getSince(drive.header.id, "global", "main", -1)
    ).results;
    expect(driveGlobalOps.map((o) => o.action.type)).toEqual(["ADD_FILE"]);
    await sv.verifyActions(
      drive.header.id,
      "main",
      driveGlobalOps.map((o) => o.action),
    );

    // The new document's own operations verify against its own id.
    const docOps = (await store.getSince(doc.header.id, "document", "main", -1))
      .results;
    expect(docOps.map((o) => o.action.type)).toEqual([
      "CREATE_DOCUMENT",
      "UPGRADE_DOCUMENT",
    ]);
    await sv.verifyActions(
      doc.header.id,
      "main",
      docOps.map((o) => o.action),
    );
  });

  it("keeps the document binding: a stamped signature does not verify in another document", async () => {
    const drive = await createDrive();
    const doc = documentModelDocumentModelModule.utils.createDocument();
    doc.header.name = "Doc";
    await client.drives.addFile(drive.header.id, doc);

    const sv = new SignatureVerifier(verifier);
    const otherId = "other-document";

    // The new document's CREATE is stamped with its own id: presenting it
    // against a different document must be rejected.
    const docCreate = (
      await store.getSince(doc.header.id, "document", "main", -1)
    ).results[0].action;
    await expect(
      sv.verifyActions(otherId, "main", [docCreate]),
    ).rejects.toThrow(/signature verification returned false/);

    // The drive's file node is stamped with the drive's id: rejected in any
    // other document.
    const driveAddFile = (
      await store.getSince(drive.header.id, "global", "main", -1)
    ).results[0].action;
    await expect(
      sv.verifyActions(otherId, "main", [driveAddFile]),
    ).rejects.toThrow(/signature verification returned false/);
  });

  it("binds addFile's relationship to the drive, not to the new document", async () => {
    const drive = await createDrive();
    const doc = documentModelDocumentModelModule.utils.createDocument();
    doc.header.name = "Doc";
    await client.drives.addFile(drive.header.id, doc);

    const sv = new SignatureVerifier(verifier);

    // The relationship lands on the drive even though it rides in the new
    // document's job, so it is signed against the drive's id.
    const relationship = (
      await store.getSince(drive.header.id, "document", "main", -1)
    ).results.find((o) => o.action.type === "ADD_RELATIONSHIP")!.action;
    await sv.verifyActions(drive.header.id, "main", [relationship]);

    // Bound, not document-agnostic: recomputing against the new document's id
    // matches nothing. Checked at the verifier, because verifyActions routes
    // ADD_RELATIONSHIP by `input.sourceId` and would resolve the drive again.
    const operation = (
      await store.getSince(drive.header.id, "document", "main", -1)
    ).results.find((o) => o.action.type === "ADD_RELATIONSHIP")!;
    await expect(
      verifier(operation, KEY, { documentId: doc.header.id }),
    ).resolves.toBe(false);
    await expect(
      verifier(operation, KEY, { documentId: drive.header.id }),
    ).resolves.toBe(true);
  });

  it("rejects a signature bound to one document on an action targeting another", async () => {
    const drive = await createDrive();
    const doc = documentModelDocumentModelModule.utils.createDocument();
    doc.header.name = "Doc";
    await client.drives.addFile(drive.header.id, doc);

    const sv = new SignatureVerifier(verifier);
    const signer = createBindingSigner();

    // Signed against the drive, then re-pointed at the new document: the
    // relationship now names the document as its source, so verifyActions
    // follows the action's target rather than the job's key and the
    // drive-bound hash matches nothing.
    const action = addRelationshipAction(
      drive.header.id,
      doc.header.id,
      "child",
    );
    const signature = await signer.signAction(action, {
      documentId: drive.header.id,
    });
    const replayed: Action = {
      ...action,
      input: {
        ...(action.input as Record<string, unknown>),
        sourceId: doc.header.id,
      },
      context: {
        ...action.context,
        signer: {
          user: { address: "0x0", networkId: "eip155", chainId: 0 },
          app: { name: "binding-test", key: KEY },
          signatures: [signature],
        },
      },
    };

    await expect(
      sv.verifyActions(drive.header.id, "main", [replayed]),
    ).rejects.toThrow(/signature verification returned false/);
  });
});
