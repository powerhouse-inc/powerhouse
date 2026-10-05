import type {
  Action,
  DocumentModelModule,
  PHDocument,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  createPresignedHeader,
  v2RequiredProtocolVersions,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { upgradeDocumentAction } from "../../src/actions/index.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule, IReactor } from "../../src/core/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";

const DOC_TYPE = "powerhouse/document-model";

/** Drops the signature protocol from whatever document it is handed. */
function downgrading(document: PHDocument): PHDocument {
  return {
    ...document,
    header: { ...document.header, protocolVersions: { "base-reducer": 2 } },
  };
}

const v1 = {
  ...documentModelDocumentModelModule,
  version: 1,
} as unknown as DocumentModelModule;

const v2 = {
  ...documentModelDocumentModelModule,
  version: 2,
  reducer: ((...args: Parameters<DocumentModelModule["reducer"]>) =>
    downgrading(
      documentModelDocumentModelModule.reducer(...(args as [never, never])),
    )) as DocumentModelModule["reducer"],
} as unknown as DocumentModelModule;

const manifest = {
  documentType: DOC_TYPE,
  latestVersion: 2,
  supportedVersions: [1, 2] as const,
  upgrades: {
    v2: { toVersion: 2, upgradeReducer: downgrading },
  },
} as unknown as UpgradeManifest<readonly number[]>;

async function settle(reactor: IReactor, job: JobInfo): Promise<JobInfo> {
  let status = await reactor.getJobStatus(job.id);
  while (
    status.status !== JobStatus.READ_READY &&
    status.status !== JobStatus.FAILED
  ) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    status = await reactor.getJobStatus(job.id);
  }
  return status;
}

describe("protocolVersions are fixed at creation", () => {
  let client: TestP256Signer;
  let module: InProcessReactorModule | undefined;

  beforeAll(async () => {
    client = await TestP256Signer.create();
  });

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function signed(action: Action, documentId: string): Promise<Action> {
    return client.signed(
      action,
      await client.v2Tuple(action, { documentId, branch: "main" }),
    );
  }

  async function execute(
    documentId: string,
    actions: Action[],
  ): Promise<JobInfo> {
    const reactor = module!.reactor;
    return settle(reactor, await reactor.execute(documentId, "main", actions));
  }

  /** A v2-required document upgraded by a reducer that rewrites the header. */
  async function upgradedV2Document(
    initialState?: Record<string, unknown>,
  ): Promise<string> {
    module = await new ReactorBuilder()
      .withDocumentModelSources([v1, v2])
      .withUpgradeManifests([manifest])
      .withExecutorConfig({ signatureVerification: "enforce" })
      .buildModule();
    const base = createDocModelDocument();
    const document: PHDocument = {
      ...base,
      header: createPresignedHeader(
        undefined,
        DOC_TYPE,
        v2RequiredProtocolVersions(),
      ),
      state: {
        ...base.state,
        document: { ...base.state.document, version: 1 },
      },
    };
    const documentId = document.header.id;
    const reactor = module.reactor;
    expect(
      (
        await settle(
          reactor,
          await reactor.create(document, client.asISigner()),
        )
      ).status,
    ).toBe(JobStatus.READ_READY);

    const upgrade = upgradeDocumentAction({
      documentId,
      model: DOC_TYPE,
      fromVersion: 1,
      toVersion: 2,
      initialState: initialState as never,
    });
    const upgraded = await execute(documentId, [
      await signed(upgrade, documentId),
    ]);
    expect(upgraded.error).toBeUndefined();
    expect(upgraded.status).toBe(JobStatus.READ_READY);
    return documentId;
  }

  async function expectStillV2Required(documentId: string): Promise<void> {
    const reactor = module!.reactor;
    const document = await reactor.get(documentId);
    expect(document.header.protocolVersions).toEqual(
      v2RequiredProtocolVersions(),
    );

    const unsigned = await execute(documentId, [
      { ...addModule({ id: "u", name: "u" }) },
    ]);
    expect(unsigned.status).toBe(JobStatus.FAILED);
    expect(unsigned.error?.message).toContain("[UNSIGNED_REQUIRED]");

    module!.writeCache.invalidate(documentId, "global", "main");
    module!.writeCache.invalidate(documentId, "document", "main");
    const rebuilt = await module!.writeCache.getState(
      documentId,
      "global",
      "main",
    );
    expect(rebuilt.header.protocolVersions).toEqual(
      v2RequiredProtocolVersions(),
    );
  }

  it("survives an upgrade reducer that rewrites the header", async () => {
    const documentId = await upgradedV2Document();
    await expectStillV2Required(documentId);
  });

  it("survives an upgrade whose initialState carries a header", async () => {
    const documentId = await upgradedV2Document({
      header: { protocolVersions: {} },
    });
    await expectStillV2Required(documentId);
  });

  it("survives a model reducer that rewrites the header", async () => {
    const documentId = await upgradedV2Document();
    const action = addModule({ id: "m", name: "m" });

    const job = await execute(documentId, [await signed(action, documentId)]);

    expect(job.error).toBeUndefined();
    expect(job.status).toBe(JobStatus.READ_READY);
    await expectStillV2Required(documentId);
  });
});
