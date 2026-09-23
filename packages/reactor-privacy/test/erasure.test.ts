import { PGlite } from "@electric-sql/pglite";
import {
  ConsistencyTracker,
  DocumentNotDeletedError,
  DocumentPurgeService,
  JobStatus,
  REACTOR_SCHEMA,
  ReactorBuilder,
  type InProcessReactorModule,
  type JobInfo,
} from "@powerhousedao/reactor";
import type {
  Context,
  IAuthorizationService,
} from "@powerhousedao/reactor-api";
import { setModelName } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PrivacyService,
  type IDocumentPermissionEraser,
} from "../src/privacy-service.js";
import { createPrivacyResolvers } from "../src/subgraph/resolvers.js";
import { SubjectDocumentsReadModel } from "../src/subject-documents-read-model.js";
import { SECRET, signer } from "./helpers.js";

const SUBJECT = "0x1111111111111111111111111111111111111111";
const ADMIN = "0x2222222222222222222222222222222222222222";

describe("an erasure request", () => {
  let baseDb: Kysely<unknown>;
  let module: InProcessReactorModule;
  let privacy: PrivacyService;
  let erased: string[];

  async function settle(job: JobInfo): Promise<void> {
    await vi.waitUntil(async () => {
      const info = await module.reactor.getJobStatus(job.id);
      if (info.status === JobStatus.FAILED) {
        throw new Error(info.error?.message);
      }
      return info.status === JobStatus.READ_READY;
    });
  }

  async function signedDocument(id: string): Promise<void> {
    const document = documentModelDocumentModelModule.utils.createDocument();
    document.header.id = id;
    await settle(await module.reactor.create(document));
    const action = setModelName({ name: `named by ${id}` });
    action.context = { signer: signer(SUBJECT, "did:key:zSubject") };
    await settle(await module.reactor.execute(id, "main", [action]));
  }

  beforeEach(async () => {
    baseDb = new Kysely<unknown>({ dialect: new PGliteDialect(new PGlite()) });
    module = await new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .withKysely(baseDb as never)
      .withReadModelFactory(async (deps) => {
        const model = new SubjectDocumentsReadModel(
          baseDb,
          REACTOR_SCHEMA,
          deps.operationIndex,
          deps.writeCache,
          new ConsistencyTracker(),
          SECRET,
        );
        await model.init();
        return model;
      })
      .buildModule();

    erased = [];
    const permissions: IDocumentPermissionEraser = {
      eraseDocument: (documentId) => {
        erased.push(documentId);
        return Promise.resolve({ permissions: 1, protection: 1 });
      },
      listForSubject: () =>
        Promise.resolve({ permissions: [], ownedDocuments: [] }),
    };
    privacy = new PrivacyService({
      db: baseDb.withSchema(REACTOR_SCHEMA),
      purgeService: new DocumentPurgeService(module),
      secret: SECRET,
      permissions,
    });
  });

  afterEach(async () => {
    module.reactor.kill();
    await baseDb.destroy();
  });

  it("purges the documents, clears their permissions and records it", async () => {
    await signedDocument("kept");
    await signedDocument("erased");
    await module.readModelCoordinator.drain();
    expect(
      (await privacy.listDocuments(SUBJECT, ADMIN)).documents.map(
        (document) => document.documentId,
      ),
    ).toEqual(["erased", "kept"]);

    await settle(await module.reactor.deleteDocument("erased"));
    await module.readModelCoordinator.drain();
    const plan = await privacy.planErasure(["erased"]);
    expect(plan.ready).toBe(true);

    const result = await privacy.eraseDocuments(["erased"], {
      requestId: "request-1",
      requester: SUBJECT,
      authoriser: ADMIN,
      identifier: SUBJECT,
    });

    expect(result.purge.purged).toEqual(["erased"]);
    expect(result.permissions).toEqual([
      { documentId: "erased", rowsDeleted: { permissions: 1, protection: 1 } },
    ]);
    expect(erased).toEqual(["erased"]);
    expect(result.purge.readModels).toContainEqual(
      expect.objectContaining({
        readModelId: "reactor-privacy-subject-documents",
        covered: true,
        rowsAffected: 2,
      }),
    );
    expect(
      (await privacy.listDocuments(SUBJECT, ADMIN)).documents.map(
        (document) => document.documentId,
      ),
    ).toEqual(["kept"]);
    await expect(module.reactor.get("erased")).rejects.toThrow();

    const log = await privacy.auditLog();
    const erasure = log.find((entry) => entry.kind === "erasure")!;
    expect(erasure).toMatchObject({
      status: "purged",
      requestId: "request-1",
      requester: `hmac:${erasure.subjectHash}`,
      authoriser: ADMIN,
      documentIds: ["erased"],
    });
    expect(erasure.subjectHash).toMatch(/^[0-9a-f]{64}$/);
    // The log outlives the erasure, so it must not hold the subject's address.
    expect(JSON.stringify(log).toLowerCase()).not.toContain(SUBJECT.slice(2));
    expect(erasure.detail).toMatchObject({
      purged: ["erased"],
      unacknowledgedShards: [],
    });
    expect(log.filter((entry) => entry.kind === "disclosure")).toHaveLength(2);
  });

  it("records a refused erasure and changes nothing", async () => {
    await signedDocument("live");
    await module.readModelCoordinator.drain();

    await expect(
      privacy.eraseDocuments(["live"], {
        requester: SUBJECT,
        authoriser: ADMIN,
      }),
    ).rejects.toSatisfy((error) => DocumentNotDeletedError.isError(error));

    const [entry] = await privacy.auditLog();
    expect(entry).toMatchObject({ kind: "erasure", status: "refused" });
    expect(erased).toEqual([]);
    expect(
      (await privacy.listDocuments(SUBJECT)).documents.map(
        (document) => document.documentId,
      ),
    ).toEqual(["live"]);
  });

  it("serves requests to administrators only", async () => {
    const authorization = {
      isSupremeAdmin: (address?: string) => address === ADMIN,
    } as unknown as IAuthorizationService;
    const resolvers = createPrivacyResolvers(privacy, authorization);
    const as = (address?: string) =>
      ({ user: address ? { address } : undefined }) as unknown as Context;

    await expect(
      resolvers.Query.privacyDisclosure(
        {},
        { identifier: SUBJECT },
        as(SUBJECT),
      ),
    ).rejects.toThrow("Admin access required");
    await expect(
      resolvers.Mutation.privacyErase(
        {},
        { input: { documentIds: ["x"], requester: SUBJECT } },
        as(),
      ),
    ).rejects.toThrow("Admin access required");

    const report = await resolvers.Query.privacyDisclosure(
      {},
      { identifier: SUBJECT },
      as(ADMIN),
    );
    expect(report.subjectHash).toMatch(/^[0-9a-f]{64}$/);
    const [entry] = await privacy.auditLog(1);
    expect(entry).toMatchObject({ kind: "disclosure", authoriser: ADMIN });
  });

  it("prunes the audit log past its retention", async () => {
    await privacy.listDocuments(SUBJECT);
    expect(await privacy.pruneAuditLog(new Date(Date.now() + 60_000))).toBe(1);
    expect(await privacy.auditLog()).toEqual([]);
  });
});
