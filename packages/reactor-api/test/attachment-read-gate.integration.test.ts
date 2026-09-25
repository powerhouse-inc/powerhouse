import type { AttachmentRef } from "@powerhousedao/reactor";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  AttachmentReferenceIndexBuilder,
  type AttachmentReferenceIndexBuildResult,
} from "@powerhousedao/reactor-attachments";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  initializeAuth,
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { AttachmentAccessService } from "../src/services/attachment-access.service.js";
import {
  AuthorizationPolicy,
  type IAuthorizationService,
} from "../src/services/authorization.service.js";
import { createCanonicalDocumentIdResolver } from "../src/services/canonical-document-id.js";
import { getDbClient } from "../src/utils/db.js";

const READER = "0xreader";
const OUTSIDER = "0xoutsider";

const openAuthorization: IAuthorizationService = {
  config: {
    admins: [],
    defaultProtection: false,
    policy: AuthorizationPolicy.OPEN,
  },
  isSupremeAdmin: () => true,
  canCreate: () => true,
  canRead: () => Promise.resolve(true),
  canWrite: () => Promise.resolve(true),
  canManage: () => Promise.resolve(true),
  canMutate: () => Promise.resolve(true),
};

function refOf(char: string): AttachmentRef {
  return `attachment://v1:${char.repeat(64)}` as AttachmentRef;
}

describe("attachment reads under OPEN with auth-scope policies", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function build() {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            driveDocumentModelModule as unknown as DocumentModelModule,
            documentModelDocumentModelModule as unknown as DocumentModelModule,
          ])
          .withExecutorConfig({
            featureFlags: { documentDecisions: true, authEnforcement: true },
          }),
      )
      .buildModule();
    const index: AttachmentReferenceIndexBuildResult =
      await new AttachmentReferenceIndexBuilder(
        getDbClient().db as Kysely<unknown>,
      ).build();
    const access = new AttachmentAccessService(
      createCanonicalDocumentIdResolver(module.client),
      openAuthorization,
      index.store,
      { status: "available" },
      module.client,
    );
    return { client: module.client, index, access };
  }

  async function createDocument(
    client: InProcessReactorClientModule["client"],
    id: string,
  ) {
    const document = withSignaturePolicy(
      documentModelDocumentModelModule.utils.createDocument(),
      "legacy",
      { id },
    );
    await client.create(document);
    return id;
  }

  async function police(
    client: InProcessReactorClientModule["client"],
    id: string,
  ) {
    await client.execute(id, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-read",
            description: "the reader reads the global scope",
            effect: "allow",
            principal: { address: READER },
            capability: { can: "read", scope: "global" },
          },
          {
            id: "g-admin",
            description: "administration stays reachable",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "auth" },
          },
        ],
      }),
    ]);
  }

  async function reference(
    index: AttachmentReferenceIndexBuildResult,
    documentId: string,
    ref: AttachmentRef,
    scope: string,
  ) {
    await index.store.addReferences([
      {
        documentId,
        ref,
        operationId: `${documentId}-${scope}`,
        branch: "main",
        scope,
        ordinal: 1,
      },
    ]);
  }

  it("serves a policed document's attachment only to a subject the document is served to", async () => {
    const { client, index, access } = await build();
    const policed = await createDocument(client, "attachment-policed");
    await police(client, policed);
    const ref = refOf("a");
    await reference(index, policed, ref, "global");

    const read = (userAddress?: string) =>
      access.canReadAttachment({
        documentId: policed,
        attachmentRef: ref,
        userAddress,
      });

    expect(await read(undefined)).toEqual({ kind: "denied" });
    expect(await read(OUTSIDER)).toEqual({ kind: "denied" });
    expect(await read(READER)).toMatchObject({ kind: "allowed" });
  });

  it("withholds an attachment referenced only from a scope the subject may not read", async () => {
    const { client, index, access } = await build();
    const policed = await createDocument(client, "attachment-local");
    await police(client, policed);
    const ref = refOf("b");
    await reference(index, policed, ref, "local");

    const result = await access.canReadAttachment({
      documentId: policed,
      attachmentRef: ref,
      userAddress: READER,
    });

    expect(result).toEqual({ kind: "denied" });
  });

  it("serves an unpoliced document's attachment to anyone", async () => {
    const { client, index, access } = await build();
    const open = await createDocument(client, "attachment-open");
    const ref = refOf("c");
    await reference(index, open, ref, "global");

    const result = await access.canReadAttachment({
      documentId: open,
      attachmentRef: ref,
    });

    expect(result).toMatchObject({ kind: "allowed" });
  });
});
