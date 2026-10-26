import { PGlite } from "@electric-sql/pglite";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule, setModelName } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type {
  Database,
  InProcessReactorModule,
} from "../../../src/core/types.js";
import { JobStatus } from "../../../src/shared/types.js";
import { createDocModelDocument } from "../../factories.js";

describe("write identity written by the executor", () => {
  let database: Kysely<Database>;
  let module: InProcessReactorModule;

  async function succeeded(jobId: string): Promise<void> {
    let status: JobStatus | undefined;
    let error: string | undefined;
    await vi.waitUntil(
      async () => {
        const info = await module.reactor.getJobStatus(jobId);
        status = info.status;
        error = info.error?.message;
        return (
          info.status === JobStatus.READ_READY ||
          info.status === JobStatus.FAILED
        );
      },
      { timeout: 20_000, interval: 20 },
    );
    expect(status, error).toBe(JobStatus.READ_READY);
  }

  async function create(id: string, slug?: string): Promise<void> {
    const job = await module.reactor.create(
      createDocModelDocument({ id, slug }),
    );
    await succeeded(job.id);
  }

  beforeEach(async () => {
    database = new Kysely<Database>({
      dialect: new PGliteDialect(new PGlite()),
    });
    module = await new ReactorBuilder()
      .withKysely(database)
      .withDocumentModelSources([
        documentModelDocumentModelModule as unknown as DocumentModelModule,
        driveDocumentModelModule as unknown as DocumentModelModule,
      ])
      .buildModule();
  });

  afterEach(async () => {
    await module.reactor.kill().completed;
    await database.destroy();
  });

  it("records a created document's slug and type", async () => {
    await create("doc-alpha", "alpha");

    const described = await module.writeIdentityStore.describe(
      "doc-alpha",
      "main",
    );
    expect(described).toMatchObject({
      documentId: "doc-alpha",
      branch: "main",
      slug: "alpha",
      documentType: "powerhouse/document-model",
      isDeleted: false,
    });
    expect(
      (await module.writeIdentityStore.resolve("alpha", "main"))?.documentId,
    ).toBe("doc-alpha");
    expect(await module.documentView.resolveIdOrSlug("alpha")).toBe(
      "doc-alpha",
    );
  });

  it("records no slug for a document whose slug is its id", async () => {
    await create("doc-plain");

    expect(
      await module.writeIdentityStore.describe("doc-plain", "main"),
    ).toMatchObject({ slug: null, isDeleted: false });
  });

  it("leaves the row alone when an operation does not touch identity", async () => {
    await create("doc-alpha", "alpha");
    const before = await module.writeIdentityStore.describe(
      "doc-alpha",
      "main",
    );

    const job = await module.reactor.execute("doc-alpha", "main", [
      setModelName({ name: "Renamed" }),
    ]);
    await succeeded(job.id);

    expect(
      await module.writeIdentityStore.describe("doc-alpha", "main"),
    ).toEqual(before);
  });

  it("moves a slug to the document that claims it last, as the view does", async () => {
    await create("doc-first", "shared");
    await create("doc-second", "shared");

    expect(
      (await module.writeIdentityStore.describe("doc-first", "main"))?.slug,
    ).toBeNull();
    expect(
      (await module.writeIdentityStore.resolve("shared", "main"))?.documentId,
    ).toBe("doc-second");
    expect(await module.documentView.resolveIdOrSlug("shared")).toBe(
      "doc-second",
    );
  });

  it("frees a deleted document's slug and removes the row on purge", async () => {
    await create("doc-alpha", "alpha");

    const deleted = await module.reactor.deleteDocument("doc-alpha");
    await succeeded(deleted.id);

    expect(
      await module.writeIdentityStore.describe("doc-alpha", "main"),
    ).toMatchObject({ slug: null, isDeleted: true });
    expect(
      await module.writeIdentityStore.resolve("alpha", "main"),
    ).toBeUndefined();

    const [purge] = await module.documentPurgeService.enqueuePurge(
      ["doc-alpha"],
      "request-1",
    );
    await succeeded(purge.id);

    expect(
      await module.writeIdentityStore.describe("doc-alpha", "main"),
    ).toBeUndefined();
  });
});
