import { PGlite } from "@electric-sql/pglite";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type AttachmentHash,
  type AttachmentRef,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  AttachmentBuilder,
  AttachmentNotFound,
  AttachmentReferenceIndexBuilder,
  SwitchboardAttachmentTransport,
  createRef,
  type AttachmentBuildResult,
} from "@powerhousedao/reactor-attachments";
import {
  AttachmentAccessService,
  AuthorizationPolicy,
  createCanonicalDocumentIdResolver,
  createHttpAdapter,
  type API,
  type IAuthorizationService,
} from "@powerhousedao/reactor-api";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  initializeAuth,
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerAttachmentRoutes } from "../../src/attachments/index.js";
import { AttachmentUrlSigner } from "../../src/attachments/url-signer.js";

const READER = "0xreader";
const OUTSIDER = "0xoutsider";
const DOC_ID = "byte-routes-policed";
const PAYLOAD = "policed attachment bytes";

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

// Bearer tokens name the caller directly; the gate is what is under test.
const verifyBearer = (authorization: string | undefined) => {
  const token = authorization?.replace(/^Bearer /, "");
  const address =
    token === "reader" ? READER : token === "outsider" ? OUTSIDER : undefined;
  return Promise.resolve({
    user: address ? { address, chainId: 1, networkId: "mainnet" } : undefined,
    admins: [],
    auth_enabled: true,
  });
};

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("attachment byte routes behind the reactor's read gate", () => {
  let module: InProcessReactorClientModule;
  let db: Kysely<unknown>;
  let replicaDb: Kysely<unknown>;
  let storagePath: string;
  let replicaPath: string;
  let attachments: AttachmentBuildResult;
  let server: Server;
  let baseUrl: string;
  let now = Date.now();
  let hash: AttachmentHash;
  let unreferencedHash: AttachmentHash;

  async function upload(content: string, token = "reader") {
    const reserved = await fetch(`${baseUrl}/attachments/reservations`, {
      method: "POST",
      headers: { ...bearer(token), "content-type": "application/json" },
      body: JSON.stringify({ mimeType: "text/plain", fileName: "a.txt" }),
    });
    const { reservationId } = (await reserved.json()) as {
      reservationId: string;
    };
    const sent = await fetch(
      `${baseUrl}/attachments/reservations/${reservationId}`,
      {
        method: "PUT",
        headers: {
          ...bearer(token),
          "content-type": "application/octet-stream",
        },
        body: content,
      },
    );
    expect(sent.status).toBe(200);
    return ((await sent.json()) as { hash: AttachmentHash }).hash;
  }

  beforeAll(async () => {
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

    await module.client.create(
      withSignaturePolicy(
        documentModelDocumentModelModule.utils.createDocument(),
        "legacy",
        { id: DOC_ID },
      ),
    );
    await module.client.execute(DOC_ID, "main", [
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

    db = new Kysely<unknown>({ dialect: new PGliteDialect(new PGlite()) });
    storagePath = await mkdtemp(join(tmpdir(), "byte-routes-gate-"));
    attachments = await new AttachmentBuilder(db, storagePath).build();
    const index = await new AttachmentReferenceIndexBuilder(db).build();
    const attachmentAccess = new AttachmentAccessService(
      createCanonicalDocumentIdResolver(module.client),
      openAuthorization,
      index.store,
      { status: "available" },
      module.client,
    );

    const { adapter } = await createHttpAdapter("express");
    adapter.setupMiddleware({});
    registerAttachmentRoutes(
      {
        httpAdapter: adapter,
        attachments,
        attachmentAccess,
        authService: { verifyBearer },
      } as unknown as API,
      {
        urlSigner: new AttachmentUrlSigner("i".repeat(32), () => now),
      },
    );
    server = await adapter.listen(0, undefined, "127.0.0.1");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no addr");
    baseUrl = `http://127.0.0.1:${address.port}`;

    hash = await upload(PAYLOAD);
    unreferencedHash = await upload("never referenced");
    await index.store.addReferences([
      {
        documentId: DOC_ID,
        ref: createRef(hash) as AttachmentRef,
        operationId: `${DOC_ID}-global`,
        branch: "main",
        scope: "global",
        ordinal: 1,
      },
    ]);

    replicaDb = new Kysely<unknown>({
      dialect: new PGliteDialect(new PGlite()),
    });
    replicaPath = await mkdtemp(join(tmpdir(), "byte-routes-replica-"));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    attachments.destroy();
    module.reactor.kill();
    await db.destroy();
    await replicaDb.destroy();
    await rm(storagePath, { recursive: true, force: true });
    await rm(replicaPath, { recursive: true, force: true });
  });

  it("refuses a hash-only GET and HEAD, even to a reader", async () => {
    for (const method of ["GET", "HEAD"]) {
      for (const headers of [{}, bearer("reader")]) {
        const res = await fetch(`${baseUrl}/attachments/${hash}`, {
          method,
          headers,
        });
        expect(res.status, `${method} ${JSON.stringify(headers)}`).toBe(404);
        await res.arrayBuffer();
      }
    }
  });

  it("serves a documentId read to a reader and refuses an outsider or anonymous caller", async () => {
    const url = `${baseUrl}/attachments/${hash}?documentId=${DOC_ID}`;

    const got = await fetch(url, { headers: bearer("reader") });
    expect(got.status).toBe(200);
    expect(await got.text()).toBe(PAYLOAD);

    const head = await fetch(url, {
      method: "HEAD",
      headers: bearer("reader"),
    });
    expect(head.status).toBe(200);

    for (const headers of [bearer("outsider"), {}]) {
      for (const method of ["GET", "HEAD"]) {
        const res = await fetch(url, { method, headers });
        expect(res.status, `${method} ${JSON.stringify(headers)}`).toBe(404);
        await res.arrayBuffer();
      }
    }
  });

  it("serves the unreferenced blob to no one, its uploader included", async () => {
    const res = await fetch(
      `${baseUrl}/attachments/${unreferencedHash}?documentId=${DOC_ID}`,
      { method: "HEAD", headers: bearer("reader") },
    );
    expect(res.status).toBe(404);
  });

  it("mints a signed URL that works without credentials and fails when tampered or expired", async () => {
    const minted = await fetch(
      `${baseUrl}/attachments/${hash}/download-target?documentId=${DOC_ID}`,
      { headers: bearer("reader") },
    );
    expect(minted.status).toBe(200);
    const target = (await minted.json()) as { url: string; kind: string };
    expect(target.kind).toBe("switchboard");

    const signed = await fetch(target.url);
    expect(signed.status).toBe(200);
    expect(await signed.text()).toBe(PAYLOAD);

    const outsiderTarget = await fetch(
      `${baseUrl}/attachments/${hash}/download-target?documentId=${DOC_ID}`,
      { headers: bearer("outsider") },
    );
    expect(outsiderTarget.status).toBe(404);

    const tampered = new URL(target.url);
    tampered.pathname = `/attachments/${unreferencedHash}`;
    const tamperedRes = await fetch(tampered);
    expect(tamperedRes.status).toBe(404);

    const mintedAt = now;
    now = mintedAt + 301_000;
    try {
      const expired = await fetch(target.url);
      expect(expired.status).toBe(404);
    } finally {
      now = mintedAt;
    }
  });

  it("lets a replica pull the bytes for a document its subject reads", async () => {
    const replicaFor = async (token: string, path: string) =>
      (
        await new AttachmentBuilder(replicaDb, path)
          .withTransport(
            new SwitchboardAttachmentTransport({
              remoteUrl: baseUrl,
              jwtHandler: () => Promise.resolve(token),
            }),
          )
          .build()
      ).store;

    const outsider = await replicaFor("outsider", join(replicaPath, "out"));
    await expect(outsider.get(hash, undefined, DOC_ID)).rejects.toBeInstanceOf(
      AttachmentNotFound,
    );

    const reader = await replicaFor("reader", join(replicaPath, "in"));
    const pulled = await reader.get(hash, undefined, DOC_ID);
    expect(await new Response(pulled.body).text()).toBe(PAYLOAD);
    expect(await reader.has(hash)).toBe(true);
  });
});
