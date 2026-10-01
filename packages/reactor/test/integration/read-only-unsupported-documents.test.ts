import {
  addFolder,
  driveDocumentModelModule,
} from "@powerhousedao/shared/document-drive";
import type {
  PeerCapability,
  PHDocumentHeader,
} from "@powerhousedao/shared/document-model";
import type * as DocumentModel from "@powerhousedao/shared/document-model";
import {
  generateId,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentIntegrityService } from "../../src/admin/document-integrity-service.js";
import { createDefaultDatabase } from "../../src/core/create-default-database.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule, IReactor } from "../../src/core/types.js";
import { REACTOR_SCHEMA } from "../../src/storage/migrations/migrator.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";

const lenient = vi.hoisted(() => ({ on: false }));

// While on, stands in for a reactor that runs base-reducer 7.
vi.mock("@powerhousedao/shared/document-model", async (importOriginal) => {
  const actual = await importOriginal<typeof DocumentModel>();
  return {
    ...actual,
    baseReducerVersion: (header: PHDocumentHeader) =>
      lenient.on && header.protocolVersions?.["base-reducer"] === 7
        ? 2
        : actual.baseReducerVersion(header),
  };
});

const BASE_REDUCER_7: PeerCapability = {
  kind: "protocol",
  name: "base-reducer",
  baseline: [1, 2],
  supported: () => [1, 2, 7],
  preferred: () => 2,
  optional: false,
};

const UNSUPPORTED = "br7-stored";
const AFTER = "v2-after";

function driveAt(id: string, version: number) {
  return withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { id, protocolVersions: { "base-reducer": version } },
  );
}

async function settled(reactor: IReactor, info: JobInfo): Promise<JobInfo> {
  await vi.waitUntil(
    async () => {
      const { status } = await reactor.getJobStatus(info.id);
      return status === JobStatus.READ_READY || status === JobStatus.FAILED;
    },
    { timeout: 10_000, interval: 5 },
  );
  return reactor.getJobStatus(info.id);
}

async function succeeded(reactor: IReactor, info: JobInfo): Promise<JobInfo> {
  const job = await settled(reactor, info);
  expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
  return job;
}

function appliedThrough(model: unknown): number {
  return (model as { appliedThrough: number }).appliedThrough;
}

describe("read-only over documents at an unsupported base-reducer version", () => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    lenient.on = false;
    for (const reactor of reactors.splice(0)) {
      reactor.kill();
    }
  });

  async function build(
    configure: (builder: ReactorBuilder) => ReactorBuilder,
  ): Promise<InProcessReactorModule> {
    const module = await configure(
      new ReactorBuilder().withDocumentModelSources([
        driveDocumentModelModule as never,
      ]),
    ).buildModule();
    reactors.push(module.reactor);
    return module;
  }

  /** Read model cursors reset, so the next boot rebuilds the whole store. */
  async function storeWithUnsupported(): Promise<{
    db: Kysely<any>;
    ordinals: { unsupported: number[]; last: number };
  }> {
    const db = await createDefaultDatabase();
    lenient.on = true;
    const wide = await build((b) =>
      b.withKysely(db).withPeerCapabilities([BASE_REDUCER_7]),
    );
    const { reactor } = wide;
    await succeeded(reactor, await reactor.create(driveAt(UNSUPPORTED, 7)));
    for (let i = 0; i < 12; i++) {
      await succeeded(
        reactor,
        await reactor.execute(UNSUPPORTED, "main", [
          addFolder({ id: generateId(), name: `f${i}`, parentFolder: null }),
        ]),
      );
    }
    await succeeded(reactor, await reactor.create(driveAt(AFTER, 2)));
    await succeeded(
      reactor,
      await reactor.execute(AFTER, "main", [
        addFolder({ id: generateId(), name: "after", parentFolder: null }),
      ]),
    );
    expect(
      (await wide.keyframeStore.listKeyframes(UNSUPPORTED)).length,
    ).toBeGreaterThan(0);
    await reactor.kill().completed;
    reactors.splice(reactors.indexOf(reactor), 1);
    lenient.on = false;

    const schema = db.withSchema(REACTOR_SCHEMA);
    const rows = await schema
      .selectFrom("operation_index_operations")
      .select(["ordinal", "documentId", "scope"])
      .orderBy("ordinal")
      .execute();
    await schema.updateTable("ViewState").set({ lastOrdinal: 0 }).execute();

    return {
      db,
      ordinals: {
        unsupported: rows
          .filter((r) => r.documentId === UNSUPPORTED && r.scope === "global")
          .map((r) => Number(r.ordinal)),
        last: Number(rows.at(-1)!.ordinal),
      },
    };
  }

  it("skips the document per document and keeps every other read", async () => {
    const { db, ordinals } = await storeWithUnsupported();
    expect(ordinals.unsupported.length).toBe(12);

    const narrow = await build((b) =>
      b.withKysely(db).withUnsupportedStoredDocuments("read-only"),
    );
    const { reactor } = narrow;
    const sweeps = await narrow.catchUp.sweepNow();

    expect(appliedThrough(narrow.documentView)).toBe(ordinals.last);
    expect(appliedThrough(narrow.processorManager)).toBe(ordinals.last);
    expect(sweeps.filter((sweep) => sweep.blockedAt)).toEqual([]);

    const stored = await reactor.get(UNSUPPORTED);
    expect(stored.header.protocolVersions?.["base-reducer"]).toBe(7);
    expect(await reactor.get(AFTER)).toBeDefined();

    const later = generateId();
    await succeeded(reactor, await reactor.create(driveAt(later, 2)));
    const write = await succeeded(
      reactor,
      await reactor.execute(later, "main", [
        addFolder({ id: generateId(), name: "later", parentFolder: null }),
      ]),
    );
    const document = await reactor.get<
      ReturnType<typeof driveDocumentModelModule.utils.createDocument>
    >(later, undefined, write.consistencyToken);
    expect(document.state.global.nodes.map((node) => node.name)).toEqual([
      "later",
    ]);

    for (const protocolSupport of [undefined, { "base-reducer": [1, 2] }]) {
      const integrity = new DocumentIntegrityService(
        narrow.keyframeStore,
        narrow.operationStore,
        narrow.writeCache,
        narrow.documentView,
        narrow.documentModelRegistry,
        protocolSupport,
      );
      const result = await integrity.validateDocument(UNSUPPORTED);
      expect(result.unsupported).toEqual({
        protocol: "base-reducer",
        version: 7,
      });
      expect(result.keyframeIssues).toEqual([]);
    }
  });

  it("still blocks on a document it registers but cannot build", async () => {
    const { db, ordinals } = await storeWithUnsupported();

    const registered = await build((b) =>
      b.withKysely(db).withPeerCapabilities([BASE_REDUCER_7]),
    );

    const sweeps = [
      ...(await registered.catchUp.sweepNow()),
      ...(await registered.catchUp.sweepNow()),
    ];

    expect(appliedThrough(registered.documentView)).toBe(
      ordinals.unsupported[0] - 1,
    );
    expect(
      sweeps
        .filter((sweep) => sweep.consumerId === "document-view")
        .map((sweep) => sweep.blockedAt?.documentId),
    ).toEqual([UNSUPPORTED, UNSUPPORTED]);
  });
});
