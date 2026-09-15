import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import {
  computeActionHashCandidates,
  hashActionContentSha256,
  type Action,
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
 * {@link hashActionContentSha256} over the stamped context document id (empty
 * when unstamped) plus scope, type and canonically serialized input, and the
 * verifier recomputes {@link computeActionHashCandidates} from the action
 * being verified instead of trusting the tuple. The ECDSA layer is replaced
 * by a fixed dummy, because what is under test is the hash binding.
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
    signAction: async (action: Action): Promise<Signature> => {
      const hash = await hashActionContentSha256(
        action.context?.documentId ?? "",
        action,
      );
      return [
        String(Math.floor(Date.now() / 1000)),
        KEY,
        hash,
        "",
        DUMMY_SIGNATURE,
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
    const [, signerKey, hash] = signatures[signatures.length - 1];
    if (signerKey !== publicKey) {
      return false;
    }
    const candidates = await computeActionHashCandidates(
      context?.documentId ?? "",
      action,
    );
    return candidates.includes(hash);
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

  it("a document-agnostic signature still verifies in any document (migration path)", async () => {
    const drive = await createDrive();
    const doc = documentModelDocumentModelModule.utils.createDocument();
    doc.header.name = "Doc";
    await client.drives.addFile(drive.header.id, doc);

    const sv = new SignatureVerifier(verifier);

    // The relationship is intentionally unstamped (it lands on the drive but
    // is submitted in the new document's job): its document-agnostic form
    // must verify against the drive - the same form pre-#2894 signatures use.
    const relationship = (
      await store.getSince(drive.header.id, "document", "main", -1)
    ).results.find((o) => o.action.type === "ADD_RELATIONSHIP")!.action;
    expect(relationship.context?.documentId).toBeUndefined();
    await sv.verifyActions(drive.header.id, "main", [relationship]);
  });
});
