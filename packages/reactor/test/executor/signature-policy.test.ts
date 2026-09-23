import type {
  Action,
  CreateDocumentActionInput,
  ISigner,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  createPresignedHeader,
  deriveOperationId,
  prune,
  v2RequiredProtocolVersions,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  addRelationshipAction,
  createDocumentAction,
  upgradeDocumentAction,
} from "../../src/actions/index.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule, IReactor } from "../../src/core/types.js";
import {
  ReactorEventTypes,
  type SignatureRefusedEvent,
} from "../../src/events/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";

const EMPTY_TUPLE_SIGNER = {
  user: { address: "", networkId: "", chainId: 0 },
  app: { name: "", key: "" },
  signatures: [["", "", "", "", ""]] as [
    string,
    string,
    string,
    string,
    string,
  ][],
};

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

async function scopeOperations(
  reactor: IReactor,
  documentId: string,
  scope: string,
): Promise<Operation[]> {
  const result = (await reactor.getOperations(documentId, {
    branch: "main",
    scopes: [scope],
  })) as Record<string, { results: Operation[] } | undefined>;
  return result[scope]?.results ?? [];
}

/** A document-model document whose header requires v2 signatures. */
function v2Document(): PHDocument {
  const document = createDocModelDocument();
  return {
    ...document,
    header: createPresignedHeader(
      undefined,
      document.header.documentType,
      v2RequiredProtocolVersions(),
    ),
  };
}

describe("signature policy", () => {
  let client: TestP256Signer;
  let clientSigner: ISigner;
  const modules: InProcessReactorModule[] = [];
  let base: number;

  beforeAll(async () => {
    client = await TestP256Signer.create();
    clientSigner = client.asISigner();
  });

  afterEach(() => {
    for (const module of modules) {
      module.reactor.kill();
    }
    modules.length = 0;
  });

  async function build(): Promise<{
    module: InProcessReactorModule;
    refusals: SignatureRefusedEvent[];
  }> {
    const module = await new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .withExecutorConfig({ signatureVerification: "enforce" })
      .buildModule();
    modules.push(module);
    const refusals: SignatureRefusedEvent[] = [];
    module.eventBus.subscribe(
      ReactorEventTypes.SIGNATURE_REFUSED,
      (_type: number, event: SignatureRefusedEvent) => {
        refusals.push(event);
      },
    );
    base = Date.now() + 60_000;
    return { module, refusals };
  }

  async function create(
    reactor: IReactor,
    document: PHDocument,
    signer?: ISigner,
  ): Promise<JobInfo> {
    return settle(reactor, await reactor.create(document, signer));
  }

  function moduleAction(id: string, offsetMs = 0): Action {
    return {
      ...addModule({ id, name: id }),
      timestampUtcMs: new Date(base + offsetMs).toISOString(),
    };
  }

  async function v2Signed(action: Action, documentId: string) {
    return client.signed(
      action,
      await client.v2Tuple(action, { documentId, branch: "main" }),
    );
  }

  async function execute(
    reactor: IReactor,
    documentId: string,
    actions: Action[],
  ): Promise<JobInfo> {
    return settle(reactor, await reactor.execute(documentId, "main", actions));
  }

  /** The v2 CREATE and UPGRADE `reactor.create` would submit for `document`. */
  function createActions(document: PHDocument): [Action, Action] {
    const { header } = document;
    const input: CreateDocumentActionInput = {
      model: header.documentType,
      version: 0,
      documentId: header.id,
      signing: {
        signature: header.id,
        publicKey: header.sig.publicKey,
        nonce: header.sig.nonce,
        createdAtUtcIso: header.createdAtUtcIso,
        documentType: header.documentType,
      },
      slug: header.slug,
      name: header.name,
      branch: header.branch,
      meta: header.meta,
      protocolVersions: header.protocolVersions,
    };
    return [
      createDocumentAction(input),
      upgradeDocumentAction({
        documentId: header.id,
        model: header.documentType,
        fromVersion: 0,
        toVersion: 1,
        initialState: document.state,
      }),
    ];
  }

  describe("on a v2-required document", () => {
    async function v2Created(): Promise<{
      reactor: IReactor;
      refusals: SignatureRefusedEvent[];
      documentId: string;
    }> {
      const { module, refusals } = await build();
      const document = v2Document();
      const created = await create(module.reactor, document, clientSigner);
      expect(created.error).toBeUndefined();
      expect(created.status).toBe(JobStatus.READ_READY);
      const [createOperation] = await scopeOperations(
        module.reactor,
        document.header.id,
        "document",
      );
      expect(
        (createOperation.action.input as CreateDocumentActionInput)
          .protocolVersions,
      ).toEqual(v2RequiredProtocolVersions());
      return {
        reactor: module.reactor,
        refusals,
        documentId: document.header.id,
      };
    }

    it("accepts a v2 tuple", async () => {
      const { reactor, documentId, refusals } = await v2Created();
      const job = await execute(reactor, documentId, [
        await v2Signed(moduleAction("m"), documentId),
      ]);
      expect(job.status).toBe(JobStatus.READ_READY);
      expect(refusals).toEqual([]);
    });

    it.each([
      ["no signer", (action: Action) => Promise.resolve(action)],
      [
        "an empty key",
        (action: Action) =>
          Promise.resolve({
            ...action,
            context: { signer: EMPTY_TUPLE_SIGNER },
          }),
      ],
    ])("refuses an action with %s as UNSIGNED_REQUIRED", async (_, sign) => {
      const { reactor, documentId, refusals } = await v2Created();
      const job = await execute(reactor, documentId, [
        await sign(moduleAction("m")),
      ]);
      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.message).toContain("[UNSIGNED_REQUIRED]");
      expect(refusals).toMatchObject([
        { documentId, code: "UNSIGNED_REQUIRED", scheme: "unsigned" },
      ]);
    });

    it("refuses renown and shared legacy tuples as SCHEME_BELOW_POLICY", async () => {
      const { reactor, documentId, refusals } = await v2Created();
      const renown = moduleAction("r");
      const shared = moduleAction("s");
      for (const action of [
        client.signed(renown, await client.renownTuple(renown)),
        client.signed(shared, await client.sharedTuple(shared, documentId)),
      ]) {
        const job = await execute(reactor, documentId, [action]);
        expect(job.status).toBe(JobStatus.FAILED);
        expect(job.error?.message).toContain("[SCHEME_BELOW_POLICY]");
      }
      expect(refusals.map((refusal) => refusal.scheme)).toEqual([
        "legacy-renown",
        "legacy-shared",
      ]);
    });

    it("refuses PRUNE, even signed v2, as ACTION_NOT_ALLOWED", async () => {
      const { reactor, documentId } = await v2Created();
      const job = await execute(reactor, documentId, [
        await v2Signed(prune(), documentId),
      ]);
      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.message).toContain("[ACTION_NOT_ALLOWED]");
    });

    it("verifies ADD_RELATIONSHIP under the header of the document it writes to", async () => {
      const { module, refusals } = await build();
      const { reactor } = module;
      const v2 = v2Document();
      const legacy = createDocModelDocument();
      expect((await create(reactor, v2, clientSigner)).status).toBe(
        JobStatus.READ_READY,
      );
      expect((await create(reactor, legacy)).status).toBe(JobStatus.READ_READY);

      const intoV2 = addRelationshipAction(
        v2.header.id,
        legacy.header.id,
        "child",
      );
      const refused = await execute(reactor, legacy.header.id, [intoV2]);
      expect(refused.status).toBe(JobStatus.FAILED);
      expect(refused.error?.message).toContain("[UNSIGNED_REQUIRED]");
      expect(refusals).toMatchObject([
        { documentId: v2.header.id, code: "UNSIGNED_REQUIRED" },
      ]);

      const intoLegacy = addRelationshipAction(
        legacy.header.id,
        v2.header.id,
        "child",
      );
      const accepted = await execute(reactor, v2.header.id, [intoLegacy]);
      expect(accepted.status).toBe(JobStatus.READ_READY);
    });
  });

  describe("CREATE_DOCUMENT", () => {
    it("is verified under its own input: unsigned is refused", async () => {
      const { module, refusals } = await build();
      const document = v2Document();

      const job = await create(module.reactor, document);

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.message).toContain("[UNSIGNED_REQUIRED]");
      expect(refusals[0]).toMatchObject({
        documentId: document.header.id,
        code: "UNSIGNED_REQUIRED",
      });
      await expect(module.reactor.get(document.header.id)).rejects.toThrow();
    });

    it("verifies later actions of the create job under the CREATE's input", async () => {
      const { module, refusals } = await build();
      const document = v2Document();
      const [createAction, upgradeAction] = createActions(document);
      const signedCreate = await v2Signed(createAction, document.header.id);

      const job = await settle(
        module.reactor,
        await module.reactor.execute(document.header.id, "main", [
          signedCreate,
          upgradeAction,
        ]),
      );

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.message).toContain("[UNSIGNED_REQUIRED]");
      expect(refusals).toMatchObject([
        { actionId: upgradeAction.id, code: "UNSIGNED_REQUIRED" },
      ]);
    });

    it("refuses a v2-required CREATE whose id does not recompute", async () => {
      const { module, refusals } = await build();
      const document = v2Document();
      const forged: PHDocument = {
        ...document,
        header: { ...document.header, id: crypto.randomUUID() },
      };

      const job = await create(module.reactor, forged, clientSigner);

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.message).toContain("[ID_MISMATCH]");
      expect(refusals[0]).toMatchObject({
        documentId: forged.header.id,
        code: "ID_MISMATCH",
      });
    });

    it("refuses a v2-required CREATE whose params were changed after the id was derived", async () => {
      const { module } = await build();
      const document = v2Document();
      const changed: PHDocument = {
        ...document,
        header: { ...document.header, sig: { publicKey: {}, nonce: "other" } },
      };

      const job = await create(module.reactor, changed, clientSigner);

      expect(job.error?.message).toContain("[ID_MISMATCH]");
    });

    it("refuses a v2-required CREATE carrying a legacy tuple", async () => {
      const { module } = await build();
      const document = v2Document();
      const [createAction] = createActions(document);

      const job = await execute(module.reactor, document.header.id, [
        client.signed(createAction, await client.renownTuple(createAction)),
      ]);

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.message).toContain("[SCHEME_BELOW_POLICY]");
    });

    it("refuses a legacy CREATE that claims a content-addressed id", async () => {
      const { module } = await build();
      const squatted = v2Document().header.id;
      const document = createDocModelDocument({ id: squatted });

      const job = await create(module.reactor, document);

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.message).toContain("[ID_MISMATCH]");
    });
  });

  describe("on a legacy document", () => {
    it("accepts unsigned, empty-key, legacy tuples and PRUNE", async () => {
      const { module, refusals } = await build();
      const { reactor } = module;
      const document = createDocModelDocument();
      const documentId = document.header.id;
      expect((await create(reactor, document)).status).toBe(
        JobStatus.READ_READY,
      );

      const renown = moduleAction("r", 2);
      const shared = moduleAction("s", 3);
      for (const action of [
        moduleAction("u", 0),
        { ...moduleAction("e", 1), context: { signer: EMPTY_TUPLE_SIGNER } },
        client.signed(renown, await client.renownTuple(renown)),
        client.signed(shared, await client.sharedTuple(shared, documentId)),
      ]) {
        const job = await execute(reactor, documentId, [action]);
        expect(job.error).toBeUndefined();
        expect(job.status).toBe(JobStatus.READ_READY);
      }

      // Admitted; the reducer's own PRUNE failure is not a refusal.
      const pruned = await execute(reactor, documentId, [prune()]);
      expect(pruned.error?.message).not.toContain("Invalid signature");
      expect(refusals).toEqual([]);
    });
  });

  describe("at a peer's load admission", () => {
    it("admits a v2-required document's v2 operations and drops a legacy-signed one", async () => {
      const origin = (await build()).module.reactor;
      const document = v2Document();
      const documentId = document.header.id;
      expect((await create(origin, document, clientSigner)).status).toBe(
        JobStatus.READ_READY,
      );
      const signed = await v2Signed(moduleAction("m", 0), documentId);
      expect((await execute(origin, documentId, [signed])).status).toBe(
        JobStatus.READ_READY,
      );

      const { module: peerModule, refusals } = await build();
      const peer = peerModule.reactor;
      for (const scope of ["document", "global"]) {
        const operations = await scopeOperations(origin, documentId, scope);
        const loaded = await settle(
          peer,
          await peer.load(documentId, "main", operations),
        );
        expect(loaded.status).toBe(JobStatus.READ_READY);
      }
      expect(refusals).toEqual([]);

      const legacy = moduleAction("l", 1);
      const legacySigned = client.signed(
        legacy,
        await client.renownTuple(legacy),
      );
      const [head] = (await scopeOperations(peer, documentId, "global")).slice(
        -1,
      );
      const loaded = await settle(
        peer,
        await peer.load(documentId, "main", [
          {
            id: deriveOperationId(documentId, "global", "main", legacy.id),
            index: head.index + 1,
            skip: 0,
            hash: "",
            timestampUtcMs: legacy.timestampUtcMs,
            action: legacySigned,
          },
        ]),
      );

      expect(loaded.status).toBe(JobStatus.READ_READY);
      expect(refusals).toMatchObject([
        { documentId, code: "SCHEME_BELOW_POLICY", path: "load" },
      ]);
      expect(
        (await scopeOperations(peer, documentId, "global")).map(
          (operation) => operation.action.id,
        ),
      ).toEqual([signed.id]);
    });
  });
});
