import type { AttachmentRef } from "@powerhousedao/reactor";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  AttachmentBuilder,
  AttachmentNotFound,
  AttachmentReferenceIndexBuilder,
  type AttachmentBuildResult,
  type AttachmentReferenceIndexBuildResult,
} from "@powerhousedao/reactor-attachments";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  initializeAuth,
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule, type ILogger } from "document-model";
import type { Kysely } from "kysely";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthenticationRequiredError } from "../src/graphql/errors.js";
import {
  AttachmentAccessService,
  type AttachmentAccessServiceOptions,
} from "../src/services/attachment-access.service.js";
import { AttachmentClientProvider } from "../src/services/authorized-attachment.service.js";
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
  let attachments: AttachmentBuildResult | undefined;
  let storagePath: string | undefined;

  afterEach(async () => {
    module?.reactor.kill();
    module = undefined;
    attachments?.destroy();
    attachments = undefined;
    if (storagePath) await rm(storagePath, { recursive: true, force: true });
    storagePath = undefined;
  });

  async function build(options?: AttachmentAccessServiceOptions) {
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
      undefined,
      options,
    );
    return { client: module.client, index, access };
  }

  /** A caller-bound attachment provider over a real attachment service. */
  async function buildProvider(options?: AttachmentAccessServiceOptions) {
    const built = await build(options);
    storagePath = await mkdtemp(join(tmpdir(), "attachment-read-gate-"));
    attachments = await new AttachmentBuilder(
      getDbClient().db as Kysely<unknown>,
      storagePath,
    ).build();
    const logger = { error: vi.fn() } as unknown as ILogger;
    const provider = new AttachmentClientProvider(
      attachments.service,
      built.access,
      logger,
    );
    return { ...built, provider, service: attachments.service };
  }

  function file(text: string) {
    return {
      file: new Blob([text]),
      fileName: "note.txt",
      mimeType: "text/plain",
    };
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

  describe("through a caller-bound attachment client", () => {
    async function seed(options?: AttachmentAccessServiceOptions) {
      const built = await buildProvider(options);
      const policed = await createDocument(built.client, "client-policed");
      await police(built.client, policed);
      const other = await createDocument(built.client, "client-other");
      await police(built.client, other);
      const open = await createDocument(built.client, "client-open");
      const payload = `bytes ${crypto.randomUUID()}`;
      const { ref } = await built.provider
        .forSubject({ address: READER })
        .upload(file(payload));
      await reference(built.index, policed, ref, "global");
      await reference(built.index, open, ref, "global");
      return { ...built, policed, other, open, ref, payload };
    }

    async function text(response: { body: ReadableStream<Uint8Array> }) {
      return new Response(response.body).text();
    }

    it("serves the bytes to a reader of the referencing document", async () => {
      const { provider, policed, ref, payload } = await seed();

      const response = await provider
        .forSubject({ address: READER })
        .download({ documentId: policed, ref });

      expect(await text(response)).toBe(payload);
    });

    it("hides the attachment from a subject the document is not served to", async () => {
      const { provider, policed, ref } = await seed();

      await expect(
        provider
          .forSubject({ address: OUTSIDER })
          .download({ documentId: policed, ref }),
      ).rejects.toBeInstanceOf(AttachmentNotFound);
    });

    it("hides the attachment from a reader of a document that does not reference it", async () => {
      const { provider, other, ref } = await seed();

      await expect(
        provider
          .forSubject({ address: READER })
          .download({ documentId: other, ref }),
      ).rejects.toBeInstanceOf(AttachmentNotFound);
    });

    it("refuses an anonymous reader when anonymous reads are refused", async () => {
      const { provider, open, ref } = await seed({
        refuseAnonymousReads: true,
      });

      await expect(
        provider.forSubject({}).download({ documentId: open, ref }),
      ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    });

    it("lets the document decide for an anonymous reader otherwise", async () => {
      const { provider, policed, open, ref, payload } = await seed({
        refuseAnonymousReads: false,
      });
      const anonymous = provider.forSubject({});

      await expect(
        anonymous.download({ documentId: policed, ref }),
      ).rejects.toBeInstanceOf(AttachmentNotFound);
      expect(
        await text(await anonymous.download({ documentId: open, ref })),
      ).toBe(payload);
    });

    it("refuses an anonymous uploader when anonymous writes are refused", async () => {
      const { provider } = await buildProvider({ refuseAnonymousWrites: true });

      await expect(
        provider.forSubject({}).upload(file(`anon ${crypto.randomUUID()}`)),
      ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    });

    it("accepts an anonymous upload when anonymous writes are allowed", async () => {
      const { provider, service } = await buildProvider({
        refuseAnonymousWrites: false,
      });
      const payload = `anon ${crypto.randomUUID()}`;

      const result = await provider.forSubject({}).upload(file(payload));

      expect(await text(await service.get(result.ref))).toBe(payload);
    });
  });
});
