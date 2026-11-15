import { PGlite } from "@electric-sql/pglite";
import {
  authAddress,
  authGroupId,
  createZip,
  type Action,
  type Operation,
} from "@powerhousedao/shared/document-model";
import { Kysely } from "kysely";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  defineInitialAuthProvider,
  JobStatus,
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "../../index.js";
import type { Database } from "../../src/core/types.js";
import { signActions } from "../../src/core/utils.js";
import { createOperation } from "../../src/executor/util.js";
import { HardenedPGliteDialect } from "../../src/storage/kysely/pglite-dialect.js";
import { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import { KyselyDocumentPurger } from "../../src/storage/kysely/document-purger.js";
import { resolveModelSources } from "../../src/core/model-sources.js";
import { TestP256Signer } from "../utils/p256-signer.js";
import {
  referenceNote,
  referenceStatement,
  referenceCompanyGroup,
} from "./reference-app.js";

describe("initial authorization atomic admission", () => {
  let signer: ReturnType<TestP256Signer["asISigner"]>;
  const hosts: InProcessReactorClientModule[] = [];
  const databases: Kysely<Database>[] = [];
  const resolutions = new Map<InProcessReactorClientModule, () => number>();
  beforeAll(async () => {
    signer = (await TestP256Signer.create()).asISigner([], {
      address: "service",
      networkId: "eip155",
      chainId: 1,
    });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    for (const host of hosts.splice(0)) {
      await host.reactorModule?.readModelCoordinator.drain();
      await host.reactor.kill().completed;
    }
    for (const database of databases.splice(0)) await database.destroy();
  });
  async function build(
    trust = true,
    groupId: string | (() => string) = "missing",
    mutateState = false,
    fact: () => string | undefined = () => undefined,
  ) {
    let resolved = 0;
    const database = new Kysely<Database>({
      dialect: new HardenedPGliteDialect(new PGlite()),
    });
    databases.push(database);
    const host = await new ReactorClientBuilder()
      .withSigner(signer)
      .withReactorBuilder(
        new ReactorBuilder()
          .withKysely(database)
          .withDocumentModelSources([
            referenceNote,
            referenceStatement,
            referenceCompanyGroup,
          ])
          .withTrustPolicy({ authorizeSigner: () => Promise.resolve(true) })
          .withExecutorConfig({
            signatureVerification: "enforce",
            featureFlags: {
              documentDecisions: true,
              authEnforcement: true,
              authGroups: true,
              authConditions: true,
            },
          })
          .withInitialAuth({
            providers: [
              defineInitialAuthProvider(referenceNote, {
                deployment: { administrator: authAddress("administrator") },
                async authorizeCreation({ initialState, read }) {
                  const factId = fact();
                  if (factId) await read(factId);
                  if (mutateState) {
                    // @ts-expect-error Provider snapshots are deeply readonly.
                    initialState.global.title = "Changed by provider";
                  }
                },
                resolveInstance: () => {
                  resolved++;
                  return { owner: authAddress("owner") };
                },
              }),
              defineInitialAuthProvider(referenceStatement, {
                deployment: {
                  administrator: authAddress("administrator"),
                  service: authAddress("service"),
                },
                authorizeCreation() {},
                resolveInstance: () => ({
                  companyMembers: authGroupId(
                    typeof groupId === "function" ? groupId() : groupId,
                  ),
                  worker: authAddress("worker"),
                }),
              }),
            ],
            trustOrigin: () => trust,
          }),
      )
      .buildModule();
    hosts.push(host);
    resolutions.set(host, () => resolved);
    return host;
  }
  async function history(host: InProcessReactorClientModule, id: string) {
    const module = host.reactorModule;
    if (!module) throw new Error("Expected local host");
    const operations: Operation[] = [];
    for (const scope of ["document", "auth"])
      operations.push(
        ...(await module.operationStore.getSince(id, scope, "main", -1))
          .results,
      );
    return operations;
  }
  async function create(host: InProcessReactorClientModule) {
    const handle = await host.write.createWithInitialAuth(
      referenceNote.utils.createDocument(),
      {
        requester: { address: "owner" },
        context: "test",
        idempotencyKey: "one",
      },
    );
    await handle.readable;
    return handle.documentId;
  }
  it("rolls back both streams and private caches when the initializer append fails", async () => {
    const host = await build();
    const coordinator = host.reactorModule?.initialAuth;
    if (!coordinator) throw new Error("Expected coordinator");
    const prepared = await coordinator.prepare(
      referenceNote.utils.createDocument(),
      {
        requester: { address: "owner" },
        context: "rollback",
        idempotencyKey: "one",
      },
      signer,
    );
    const original = KyselyOperationStore.prototype.apply;
    vi.spyOn(KyselyOperationStore.prototype, "apply").mockImplementation(
      async function (this: KyselyOperationStore, ...args) {
        const result = await original.apply(this, args);
        if (args[2] === "auth") throw new Error("injected initializer failure");
        return result;
      },
    );
    const job = await host.reactor.execute(
      prepared.document.header.id,
      "main",
      prepared.actions,
    );
    expect((await host.read.waitForJob(job.id)).status).toBe(JobStatus.FAILED);
    expect(await history(host, prepared.document.header.id)).toEqual([]);
    await expect(
      host.reactorModule?.writeCache.getState(
        prepared.document.header.id,
        "document",
        "main",
      ),
    ).rejects.toThrow();
    const record = await host.reactorModule?.database
      .selectFrom("InitialAuthCreation")
      .select("committed")
      .executeTakeFirst();
    expect(record?.committed).toBe(false);
  });
  it("keeps out-of-order fragments invisible and atomically publishes the completed bootstrap", async () => {
    const source = await build();
    const receiver = await build();
    const id = await create(source);
    const operations = await history(source, id);
    const ordered = [operations[2], operations[1], operations[0]];
    for (const operation of ordered.slice(0, 2)) {
      const job = await receiver.reactor.load(id, "main", [operation]);
      expect((await receiver.read.waitForJob(job.id)).status).toBe(
        JobStatus.READ_READY,
      );
      expect(await history(receiver, id)).toEqual([]);
      await expect(receiver.read.get(id)).rejects.toThrow();
    }
    const job = await receiver.reactor.load(id, "main", [ordered[2]]);
    expect((await receiver.read.waitForJob(job.id)).status).toBe(
      JobStatus.READ_READY,
    );
    expect(await history(receiver, id)).toHaveLength(3);
    const document = await receiver.read.get(id, {
      subject: { address: "administrator" },
    });
    expect(document.state.auth.version).toBe(1);
    expect(document.state.auth.creator).toBeUndefined();
  });
  it("rejects tampered, unsigned and wrong-branch fragments before retaining them", async () => {
    const source = await build();
    const receiver = await build();
    const id = await create(source);
    const operations = await history(source, id);
    const initializer = operations[2];
    const corrupted: Operation[] = [
      {
        ...initializer,
        action: { ...initializer.action, input: { version: 1, grants: [] } },
      },
      {
        ...initializer,
        action: {
          ...initializer.action,
          context: { initialAuth: initializer.action.context?.initialAuth },
        },
      },
    ];
    for (const operation of corrupted) {
      const job = await receiver.reactor.load(id, "main", [operation]);
      expect((await receiver.read.waitForJob(job.id)).status).toBe(
        JobStatus.FAILED,
      );
      expect(
        await receiver.reactorModule?.database
          .selectFrom("InitialAuthInbox")
          .selectAll()
          .execute(),
      ).toEqual([]);
    }
    const wrongBranch = await receiver.reactor.load(id, "other", [initializer]);
    expect((await receiver.read.waitForJob(wrongBranch.id)).status).toBe(
      JobStatus.FAILED,
    );
    expect(
      await receiver.reactorModule?.database
        .selectFrom("InitialAuthInbox")
        .selectAll()
        .execute(),
    ).toEqual([]);
    const good = await receiver.reactor.load(id, "main", operations);
    expect((await receiver.read.waitForJob(good.id)).status).toBe(
      JobStatus.READ_READY,
    );
    expect(await history(receiver, id)).toHaveLength(3);
  });
  it("isolates another signer's candidates and ignores altered routing hints", async () => {
    const source = await build();
    const receiver = await build();
    const id = await create(source);
    const operations = await history(source, id);
    const foreign = (await TestP256Signer.create()).asISigner([], {
      address: "outsider",
      networkId: "eip155",
      chainId: 1,
    });
    const foreignCreate = {
      ...operations[0],
      action: (
        await signActions(
          [
            {
              ...operations[0].action,
              context: {
                initialAuth: operations[0].action.context?.initialAuth,
              },
            },
          ],
          foreign,
          { documentId: id, branch: "main" },
        )
      )[0],
    };
    const rejected = await receiver.reactor.load(id, "main", [foreignCreate]);
    expect((await receiver.read.waitForJob(rejected.id)).status).toBe(
      JobStatus.FAILED,
    );
    expect(
      await receiver.reactorModule?.database
        .selectFrom("InitialAuthInbox")
        .selectAll()
        .execute(),
    ).toEqual([]);
    const foreignInitializer = {
      ...operations[2],
      action: (
        await signActions(
          [
            {
              ...operations[2].action,
              context: {
                initialAuth: operations[2].action.context?.initialAuth,
              },
            },
          ],
          foreign,
          { documentId: id, branch: "main" },
        )
      )[0],
    };
    const staged = await receiver.reactor.load(id, "main", [
      foreignInitializer,
    ]);
    expect((await receiver.read.waitForJob(staged.id)).status).toBe(
      JobStatus.READ_READY,
    );
    const alteredHint = {
      ...operations[2],
      index: 999,
      skip: 100,
      hash: "unsigned-hash",
      error: "unsigned-error",
      action: {
        ...operations[2].action,
        context: {
          ...operations[2].action.context,
          initialAuth: "untrusted-routing-hint",
        },
      },
    };
    const hint = await receiver.reactor.load(id, "main", [alteredHint]);
    expect((await receiver.read.waitForJob(hint.id)).status).toBe(
      JobStatus.READ_READY,
    );
    const good = await receiver.reactor.load(
      id,
      "main",
      operations.slice(0, 2),
    );
    expect((await receiver.read.waitForJob(good.id)).status).toBe(
      JobStatus.READ_READY,
    );
    expect(await history(receiver, id)).toHaveLength(3);
    expect(
      await receiver.reactorModule?.database
        .selectFrom("InitialAuthInbox")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });
  it("discards a signed pre-genesis suffix without blocking authentic creation", async () => {
    const source = await build();
    const receiver = await build();
    const id = await create(source);
    const operations = await history(source, id);
    const owner = (await TestP256Signer.create()).asISigner([], {
      address: "owner",
      networkId: "eip155",
      chainId: 1,
    });
    const action = referenceNote.actions.setTitle({ title: "Poisoned" });
    action.timestampUtcMs = new Date(
      Date.parse(operations[0].action.timestampUtcMs) - 1,
    ).toISOString();
    const signed = (
      await signActions([action], owner, { documentId: id, branch: "main" })
    )[0];
    const suffix = createOperation(signed, 0, 0, {
      documentId: id,
      scope: "global",
      branch: "main",
    });
    const staged = await receiver.reactor.load(id, "main", [operations[2]]);
    expect((await receiver.read.waitForJob(staged.id)).status).toBe(
      JobStatus.READ_READY,
    );
    const following = await receiver.reactor.load(id, "main", [suffix]);
    expect((await receiver.read.waitForJob(following.id)).status).toBe(
      JobStatus.READ_READY,
    );
    const completed = await receiver.reactor.load(
      id,
      "main",
      operations.slice(0, 2),
    );
    expect((await receiver.read.waitForJob(completed.id)).status).toBe(
      JobStatus.READ_READY,
    );
    expect(await history(receiver, id)).toHaveLength(3);
    const document = await receiver.read.get<
      ReturnType<typeof referenceNote.utils.createDocument>
    >(id, { subject: { address: "owner" } });
    expect(document.state.auth.version).toBe(1);
    expect(document.state.global.title).not.toBe("Poisoned");
    expect(
      (
        await receiver.reactorModule?.operationStore.getSince(
          id,
          "global",
          "main",
          -1,
        )
      )?.results,
    ).toEqual([]);
    expect(
      await receiver.reactorModule?.database
        .selectFrom("InitialAuthInbox")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });
  it("commits the protected prefix and retries a rolled-back following scope on redelivery", async () => {
    const source = await build();
    const receiver = await build();
    const id = await create(source);
    const operations = await history(source, id);
    const owner = (await TestP256Signer.create()).asISigner([], {
      address: "owner",
      networkId: "eip155",
      chainId: 1,
    });
    const signed = await signActions(
      [referenceNote.actions.setTitle({ title: "After recovery" })],
      owner,
      { documentId: id, branch: "main" },
    );
    const sourceJob = await source.reactor.execute(id, "main", signed);
    expect((await source.read.waitForJob(sourceJob.id)).status).toBe(
      JobStatus.READ_READY,
    );
    const suffix = (
      await source.reactorModule?.operationStore.getSince(
        id,
        "global",
        "main",
        -1,
      )
    )?.results[0];
    if (!suffix) throw new Error("Expected following operation");
    const staged = await receiver.reactor.load(id, "main", [operations[2]]);
    expect((await receiver.read.waitForJob(staged.id)).status).toBe(
      JobStatus.READ_READY,
    );
    const following = await receiver.reactor.load(id, "main", [suffix]);
    expect((await receiver.read.waitForJob(following.id)).status).toBe(
      JobStatus.READ_READY,
    );
    const original = KyselyOperationStore.prototype.apply;
    const failure = vi
      .spyOn(KyselyOperationStore.prototype, "apply")
      .mockImplementation(async function (this: KyselyOperationStore, ...args) {
        const result = await original.apply(this, args);
        if (args[2] === "global")
          throw new Error("injected following scope failure");
        return result;
      });
    const completed = await receiver.reactor.load(
      id,
      "main",
      operations.slice(0, 2),
    );
    const receipt = await receiver.read.waitForJob(completed.id);
    expect(receipt.status).toBe(JobStatus.READ_READY);
    expect(
      receipt.consistencyToken.coordinates.some(
        (coordinate) => coordinate.scope === "global",
      ),
    ).toBe(false);
    expect(await history(receiver, id)).toHaveLength(3);
    expect(
      (
        await receiver.reactorModule?.operationStore.getSince(
          id,
          "global",
          "main",
          -1,
        )
      )?.results,
    ).toEqual([]);
    const document = await receiver.read.get<
      ReturnType<typeof referenceNote.utils.createDocument>
    >(id, { subject: { address: "owner" } });
    expect(document.state.auth.version).toBe(1);
    expect(document.state.global.title).not.toBe("After recovery");
    expect(
      await receiver.reactorModule?.database
        .selectFrom("InitialAuthInbox")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
    failure.mockRestore();
    const retry = await receiver.reactor.load(id, "main", operations);
    const recovered = await receiver.read.waitForJob(retry.id);
    expect(recovered.status).toBe(JobStatus.READ_READY);
    expect(
      recovered.consistencyToken.coordinates.map(
        (coordinate) => coordinate.scope,
      ),
    ).toContain("global");
    expect(await history(receiver, id)).toHaveLength(3);
    expect(
      (
        await receiver.read.get<
          ReturnType<typeof referenceNote.utils.createDocument>
        >(id, { subject: { address: "owner" } })
      ).state.global.title,
    ).toBe("After recovery");
    expect(
      await receiver.reactorModule?.database
        .selectFrom("InitialAuthInbox")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });
  it("reserves bootstrap capacity when unrelated signed suffixes fill the inbox", async () => {
    const source = await build();
    const receiver = await build();
    const id = await create(source);
    const operations = await history(source, id);
    const foreign = (await TestP256Signer.create()).asISigner([], {
      address: "outsider",
      networkId: "eip155",
      chainId: 1,
    });
    const actions = Array.from({ length: 1000 }, () => ({
      ...referenceNote.actions.setTitle({ title: "Cannot reserve genesis" }),
      timestampUtcMs: new Date(
        Date.parse(operations[0].action.timestampUtcMs) - 1,
      ).toISOString(),
      context: { initialAuth: operations[2].action.context?.initialAuth },
    }));
    const signed = await signActions(actions, foreign, {
      documentId: id,
      branch: "main",
    });
    const suffixes = signed.map((action, index) =>
      createOperation(action, index, 0, {
        documentId: id,
        scope: "global",
        branch: "main",
      }),
    );
    const staged = await receiver.reactor.load(id, "main", suffixes);
    expect((await receiver.read.waitForJob(staged.id)).status).toBe(
      JobStatus.READ_READY,
    );
    expect(
      await receiver.reactorModule?.database
        .selectFrom("InitialAuthInbox")
        .selectAll()
        .execute(),
    ).toHaveLength(1000);
    const completed = await receiver.reactor.load(id, "main", operations);
    expect((await receiver.read.waitForJob(completed.id)).status).toBe(
      JobStatus.READ_READY,
    );
    expect(await history(receiver, id)).toHaveLength(3);
    expect(
      await receiver.reactorModule?.database
        .selectFrom("InitialAuthInbox")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });
  it("refuses hinted staging against an existing ordinary document", async () => {
    const host = await build();
    const group = await host.write.create(
      referenceCompanyGroup.utils.createDocument(),
    );
    await group.readable;
    const id = await create(host);
    const initializer = (await history(host, id))[2];
    const action = (
      await signActions(
        [
          {
            ...initializer.action,
            id: "legacy-poison",
            context: { initialAuth: initializer.action.context?.initialAuth },
          },
        ],
        signer,
        { documentId: group.documentId, branch: "main" },
      )
    )[0];
    const job = await host.reactor.load(group.documentId, "main", [
      { ...initializer, action },
    ]);
    expect((await host.read.waitForJob(job.id)).status).toBe(JobStatus.FAILED);
    const otherBranch = (
      await signActions(
        [
          {
            ...initializer.action,
            id: "other-branch-poison",
            context: { initialAuth: initializer.action.context?.initialAuth },
          },
        ],
        signer,
        { documentId: group.documentId, branch: "other" },
      )
    )[0];
    const another = await host.reactor.load(group.documentId, "other", [
      { ...initializer, action: otherBranch },
    ]);
    expect((await host.read.waitForJob(another.id)).status).toBe(
      JobStatus.FAILED,
    );
    expect(
      await host.reactorModule?.database
        .selectFrom("InitialAuthInbox")
        .selectAll()
        .execute(),
    ).toEqual([]);
    const normal = await host.write.execute(group.documentId, "main", [
      referenceCompanyGroup.actions.addMember({ address: "member" }),
    ]);
    await normal.readable;
    expect(
      (
        await host.read.get<
          ReturnType<typeof referenceCompanyGroup.utils.createDocument>
        >(group.documentId)
      ).state.global,
    ).toEqual({ members: ["member"] });
  });
  it("refuses an otherwise valid envelope from an untrusted origin without a visible creation", async () => {
    const source = await build();
    const receiver = await build(false);
    const id = await create(source);
    const job = await receiver.reactor.load(
      id,
      "main",
      await history(source, id),
    );
    expect((await receiver.read.waitForJob(job.id)).status).toBe(
      JobStatus.FAILED,
    );
    expect(await history(receiver, id)).toEqual([]);
  });
  it("refuses foreign and backdated initializers and ordinary actions before the commitment", async () => {
    const host = await build();
    const id = await create(host);
    const operations = await history(host, id);
    const initial = operations[2].action;
    for (const action of [
      { ...initial, id: "foreign-initializer" },
      {
        ...referenceNote.actions.setTitle({ title: "backdated" }),
        timestampUtcMs: "2000-01-01T00:00:00.000Z",
      },
    ] satisfies Action[]) {
      const signed = await signActions([action], signer, {
        documentId: id,
        branch: "main",
      });
      const job = await host.reactor.execute(id, "main", signed);
      expect((await host.read.waitForJob(job.id)).status).toBe(
        JobStatus.FAILED,
      );
    }
    expect(await history(host, id)).toHaveLength(3);
  });
  it("copies the current policy without resolving defaults and requires every source scope", async () => {
    const host = await build();
    const id = await create(host);
    await expect(
      host.write.copyWithInitialAuth(id, {
        requester: { address: "owner" },
        context: "copy",
        idempotencyKey: "denied",
      }),
    ).rejects.toThrow("every source domain scope");
    const copy = await host.write.copyWithInitialAuth(id, {
      requester: { address: "administrator" },
      context: "copy",
      idempotencyKey: "copy",
    });
    await copy.readable;
    const source = await host.read.get(id, {
      subject: { address: "administrator" },
    });
    const copied = await host.read.get(copy.documentId, {
      subject: { address: "administrator" },
    });
    expect(copied.state.auth).toEqual(source.state.auth);
    expect(copied.header.initialAuth?.kind).toBe("copy");
    expect(resolutions.get(host)?.()).toBe(1);
    expect(await history(host, copy.documentId)).toHaveLength(3);
    const owner = (await TestP256Signer.create()).asISigner([], {
      address: "owner",
      networkId: "eip155",
      chainId: 1,
    });
    const changed = await host.reactor.execute(
      id,
      "main",
      await signActions(
        [referenceNote.actions.setTitle({ title: "Changed source" })],
        owner,
        { documentId: id, branch: "main" },
      ),
    );
    expect((await host.read.waitForJob(changed.id)).status).toBe(
      JobStatus.READ_READY,
    );
    const repeated = await host.write.copyWithInitialAuth(id, {
      requester: { address: "administrator" },
      context: "copy",
      idempotencyKey: "copy",
    });
    await repeated.readable;
    expect(repeated.documentId).toBe(copy.documentId);
    expect(
      (
        await host.read.get(copy.documentId, {
          subject: { address: "administrator" },
        })
      ).state,
    ).toEqual(copied.state);
    expect(resolutions.get(host)?.()).toBe(1);
  });
  it("admits archive history without trusting its mutable current state and rejects incomplete archives", async () => {
    const source = await build();
    const receiver = await build();
    const id = await create(source);
    const document = await source.read.get(id, {
      subject: { address: "administrator" },
    });
    const operations = await history(source, id);
    document.operations = {
      document: operations.filter(
        (operation) => operation.action.scope === "document",
      ),
      auth: operations.filter((operation) => operation.action.scope === "auth"),
    };
    const archive = await referenceNote.utils.loadFromInput(
      await createZip(document),
    );
    archive.state.auth = { version: 0, grants: [] };
    archive.state.global.title = "Untrusted current-state cache";
    const imported = await receiver.write.importWithInitialAuth(archive);
    await imported.readable;
    const stored = await receiver.read.get(id, {
      subject: { address: "administrator" },
    });
    expect(stored.state).toEqual(document.state);
    await expect(
      createZip({
        ...document,
        operations: { document: document.operations.document },
      }),
    ).rejects.toThrow("complete readable bootstrap history");
  });
  it("refuses generic local bootstrap submission without the host's prepared intent", async () => {
    const source = await build();
    const receiver = await build();
    const id = await create(source);
    const job = await receiver.reactor.execute(
      id,
      "main",
      (await history(source, id)).map((operation) => operation.action),
    );
    expect((await receiver.read.waitForJob(job.id)).status).toBe(
      JobStatus.FAILED,
    );
    expect(await history(receiver, id)).toEqual([]);
  });
  it("rejects explicit unknown protocols and mutation of provider snapshots", async () => {
    const host = await build();
    for (const protocolVersions of [
      { "auth-bootstrap": 999 },
      { "auth-bootstrap": 1 },
      { signature: 999 },
    ] as Record<string, number>[]) {
      const draft = referenceNote.utils.createDocument();
      draft.header.protocolVersions = protocolVersions;
      await expect(
        host.write.createWithInitialAuth(draft, {
          requester: { address: "owner" },
          context: "protocol",
          idempotencyKey: JSON.stringify(protocolVersions),
        }),
      ).rejects.toThrow();
    }
    const mutating = await build(true, "missing", true);
    await expect(create(mutating)).rejects.toThrow();
    expect(
      await mutating.reactorModule?.database
        .selectFrom("InitialAuthCreation")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });
  it("verifies required group bindings before persisting a creation intent", async () => {
    const host = await build();
    await expect(
      host.write.createWithInitialAuth(
        referenceStatement.utils.createDocument(),
        {
          requester: { address: "owner" },
          context: "missing-group",
          idempotencyKey: "one",
        },
      ),
    ).rejects.toThrow();
    expect(
      await host.reactorModule?.database
        .selectFrom("InitialAuthCreation")
        .selectAll()
        .execute(),
    ).toEqual([]);
    const noteId = await create(host);
    const wrongType = await build(true, noteId);
    const job = await wrongType.reactor.load(
      noteId,
      "main",
      await history(host, noteId),
    );
    expect((await wrongType.read.waitForJob(job.id)).status).toBe(
      JobStatus.READ_READY,
    );
    await expect(
      wrongType.write.createWithInitialAuth(
        referenceStatement.utils.createDocument(),
        {
          requester: { address: "owner" },
          context: "wrong-group",
          idempotencyKey: "one",
        },
      ),
    ).rejects.toThrow("valid group document");
  });
  it("resolves group bindings on main when creating a protected document on another branch", async () => {
    let groupId = "missing";
    const host = await build(true, () => groupId);
    const group = await host.write.create(
      referenceCompanyGroup.utils.createDocument(),
    );
    await group.readable;
    groupId = group.documentId;
    const draft = referenceStatement.utils.createDocument();
    draft.header.branch = "preview";
    const created = await host.write.createWithInitialAuth(draft, {
      requester: { address: "service" },
      context: "branch",
      idempotencyKey: "one",
    });
    await created.readable;
    expect(created.branch).toBe("preview");
    const document = await host.read.get(created.documentId, {
      branch: "preview",
      subject: { address: "worker" },
    });
    expect(document.state.auth.version).toBe(1);
  });
  it("rejects creation when a host authorization fact changes before commit", async () => {
    let factId: string | undefined;
    const host = await build(true, "missing", false, () => factId);
    factId = await create(host);
    const coordinator = host.reactorModule?.initialAuth;
    if (!coordinator) throw new Error("Expected coordinator");
    const prepared = await coordinator.prepare(
      referenceNote.utils.createDocument(),
      {
        requester: { address: "owner" },
        context: "facts",
        idempotencyKey: "new",
      },
      signer,
    );
    const owner = (await TestP256Signer.create()).asISigner([], {
      address: "owner",
      networkId: "eip155",
      chainId: 1,
    });
    const changed = await host.reactor.execute(
      factId,
      "main",
      await signActions(
        [referenceNote.actions.setTitle({ title: "Changed fact" })],
        owner,
        { documentId: factId, branch: "main" },
      ),
    );
    expect((await host.read.waitForJob(changed.id)).status).toBe(
      JobStatus.READ_READY,
    );
    const attempt = await host.reactor.execute(
      prepared.document.header.id,
      "main",
      prepared.actions,
    );
    expect((await host.read.waitForJob(attempt.id)).status).toBe(
      JobStatus.FAILED,
    );
    expect(await history(host, prepared.document.header.id)).toEqual([]);
  });
  it("scrubs purged initial state and rejects delayed fragments and retries", async () => {
    const host = await build();
    const id = await create(host);
    const original = await history(host, id);
    const module = host.reactorModule;
    if (!module) throw new Error("Expected local host");
    await module.readModelCoordinator.drain();
    await module.database.transaction().execute(async (transaction) => {
      const purger = new KyselyDocumentPurger(transaction);
      const removedRows = await purger.deleteRows(id);
      await purger.writeTombstone({
        documentId: id,
        ordinal: 100,
        removedRows,
        purgedAtUtc: new Date(),
        requestId: "purge-initial-auth",
      });
    });
    const record = await module.database
      .selectFrom("InitialAuthCreation")
      .selectAll()
      .where("documentId", "=", id)
      .executeTakeFirstOrThrow();
    expect(record.envelope).toEqual([]);
    expect(record.facts).toEqual([]);
    await expect(create(host)).rejects.toThrow("purged");
    const late = await host.reactor.load(id, "main", [original[2]]);
    expect((await host.read.waitForJob(late.id)).status).toBe(JobStatus.FAILED);
    expect(
      await module.database
        .selectFrom("InitialAuthInbox")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });
  it("rejects conflicting opted-in registrations while retaining legacy deduplication", async () => {
    const unprotected = { ...referenceNote, initialAuth: undefined };
    await expect(
      resolveModelSources([referenceNote, unprotected]),
    ).rejects.toThrow();
    await expect(
      resolveModelSources([unprotected, referenceNote]),
    ).rejects.toThrow();
    expect(
      (await resolveModelSources([unprotected, unprotected])).modules,
    ).toHaveLength(1);
  });
  it("accepts an immediate operation with a frozen same-millisecond clock", async () => {
    const host = await build();
    const owner = (await TestP256Signer.create()).asISigner([], {
      address: "owner",
      networkId: "eip155",
      chainId: 1,
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    const id = await create(host);
    const action = referenceNote.actions.setTitle({
      title: "Same millisecond",
    });
    const job = await host.reactor.execute(
      id,
      "main",
      await signActions([action], owner, { documentId: id, branch: "main" }),
    );
    expect((await host.read.waitForJob(job.id)).status).toBe(
      JobStatus.READ_READY,
    );
    expect((await history(host, id))[2].action.timestampUtcMs).toBe(
      action.timestampUtcMs,
    );
  });
});
