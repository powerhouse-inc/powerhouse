import { PGlite } from "@electric-sql/pglite";
import {
  authAddress,
  authGroupId,
  groupDocumentType,
  initializeAuth,
  removeGrant,
  setGrant,
  type Action,
  type ISigner,
} from "@powerhousedao/shared/document-model";
import { Kysely } from "kysely";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { DocumentOf } from "document-model";
import {
  defineInitialAuthProvider,
  JobStatus,
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "../../index.js";
import type { Database } from "../../src/core/types.js";
import { signActions } from "../../src/core/utils.js";
import { HardenedPGliteDialect } from "../../src/storage/kysely/pglite-dialect.js";
import { TestP256Signer } from "../utils/p256-signer.js";
import {
  referenceCompanyGroup,
  referenceNote,
  referenceProfile,
  referenceStatement,
} from "./reference-app.js";

type Actor = "administrator" | "owner" | "outsider" | "service" | "worker";
type ActorSigner = ISigner & Required<Pick<ISigner, "app" | "user">>;
type Note = DocumentOf<typeof referenceNote>;
type Profile = DocumentOf<typeof referenceProfile>;
type Statement = DocumentOf<typeof referenceStatement>;

describe("initial authorization in reference application workflows", () => {
  let actors: Record<Actor, ActorSigner>;
  const hosts = new Set<InProcessReactorClientModule>();
  const databases = new Set<Kysely<Database>>();

  beforeAll(async () => {
    async function signer(address: string) {
      const identity = (await TestP256Signer.create()).asISigner([], {
        address,
        networkId: "eip155",
        chainId: 1,
      });
      if (!identity.app || !identity.user)
        throw new Error("Reference actors require an app key and user address");
      return { ...identity, app: identity.app, user: identity.user };
    }
    actors = {
      administrator: await signer("0xadministrator"),
      owner: await signer("0xowner"),
      outsider: await signer("0xoutsider"),
      service: await signer("0xservice"),
      worker: await signer("0xworker"),
    };
  });

  afterEach(async () => {
    for (const host of hosts) await host.reactor.kill().completed;
    hosts.clear();
    for (const db of databases) await db.destroy();
    databases.clear();
  });

  const address = (actor: Actor) => authAddress(actors[actor].user.address);
  const requester = (actor: Actor) => ({
    address: actors[actor].user.address,
    key: actors[actor].app.key,
  });

  async function build(db?: Kysely<Database>) {
    const database =
      db ??
      new Kysely<Database>({
        dialect: new HardenedPGliteDialect(new PGlite()),
      });
    databases.add(database);
    const bindingCalls: string[] = [];
    let companyGroupId: string | undefined;
    const noteProvider = defineInitialAuthProvider(referenceNote, {
      deployment: { administrator: address("administrator") },
      authorizeCreation: ({ requester: subject }) => {
        bindingCalls.push("note:authorize");
        if (subject.address !== address("owner"))
          throw new Error("Creation refused");
      },
      resolveInstance: ({ requester: subject }) => {
        bindingCalls.push("note:resolve");
        return { owner: authAddress(subject.address) };
      },
    });
    const profileProvider = defineInitialAuthProvider(referenceProfile, {
      deployment: {
        administrator: address("administrator"),
        service: address("service"),
      },
      authorizeCreation: ({ requester: subject, initialState }) => {
        if (
          subject.address !== address("service") ||
          initialState.global.ownerAddress !== null
        ) {
          throw new Error(
            "Only the invitation service creates unclaimed profiles",
          );
        }
      },
      resolveInstance: () => ({}),
    });
    const statementProvider = defineInitialAuthProvider(referenceStatement, {
      deployment: {
        administrator: address("administrator"),
        service: address("service"),
      },
      authorizeCreation: async ({ requester: subject, initialState, read }) => {
        if (
          subject.address !== address("owner") ||
          initialState.global.companyId !== "company-a" ||
          !companyGroupId
        ) {
          throw new Error("Company creation refused");
        }
        const group = await read(companyGroupId);
        if (group.header.documentType !== groupDocumentType)
          throw new Error("Invalid company group");
      },
      resolveInstance: () => {
        if (!companyGroupId) throw new Error("Company group is unavailable");
        return {
          companyMembers: authGroupId(companyGroupId),
          worker: address("worker"),
        };
      },
    });
    const host = await new ReactorClientBuilder()
      .withSigner(actors.service)
      .withReactorBuilder(
        new ReactorBuilder()
          .withKysely(database)
          .withDocumentModelSources([
            referenceCompanyGroup,
            referenceNote,
            referenceProfile,
            referenceStatement,
          ])
          .withTrustPolicy({
            authorizeSigner: (signer, key) =>
              Promise.resolve(
                Object.values(actors).some(
                  (actor) =>
                    actor.app.key === key &&
                    actor.user.address === signer.user.address,
                ),
              ),
          })
          .withExecutorConfig({
            signatureVerification: "enforce",
            featureFlags: {
              documentDecisions: true,
              authEnforcement: true,
              authGroups: true,
              authConditions: true,
              undoV3: true,
            },
          })
          .withInitialAuth({
            providers: [noteProvider, profileProvider, statementProvider],
            trustOrigin: ({ initializerKey }) =>
              initializerKey === actors.service.app.key,
          }),
      )
      .buildModule();
    hosts.add(host);
    return {
      host,
      database,
      bindingCalls,
      setCompanyGroup(id: string) {
        companyGroupId = id;
      },
    };
  }

  async function executeAs(
    host: InProcessReactorClientModule,
    actor: Actor,
    id: string,
    action: Action,
  ) {
    const actions = await signActions([action], actors[actor], {
      documentId: id,
      branch: "main",
    });
    const job = await host.reactor.execute(id, "main", actions);
    return host.read.waitForJob(job.id);
  }

  it("replicates a stream batch containing initialization and later revocation before the document stream arrives", async () => {
    const source = (await build()).host;
    const creation = await source.write.createWithInitialAuth(
      referenceNote.utils.createDocument(),
      {
        requester: requester("owner"),
        idempotencyKey: "replicated-note",
        context: "company-a",
      },
    );
    const id = (await creation.readable).documentId;
    expect(
      (
        await executeAs(
          source,
          "administrator",
          id,
          removeGrant({ id: "owner-title" }),
        )
      ).status,
    ).toBe(JobStatus.READ_READY);
    const expected = await source.reactor.getByIdOrSlug<Note>(id);
    const history = await source.reactor.getOperations(id);
    expect(
      history.auth.results.map((operation) => operation.action.type),
    ).toEqual(["INITIALIZE_AUTH", "REMOVE_GRANT"]);
    const replica = (await build()).host;
    const authLoad = await replica.reactor.load(
      id,
      "main",
      history.auth.results,
    );
    expect((await replica.read.waitForJob(authLoad.id)).status).toBe(
      JobStatus.READ_READY,
    );
    await expect(replica.reactor.getByIdOrSlug(id)).rejects.toThrow();
    const documentLoad = await replica.reactor.load(
      id,
      "main",
      history.document.results,
    );
    expect((await replica.read.waitForJob(documentLoad.id)).status).toBe(
      JobStatus.READ_READY,
    );
    const copied = await replica.reactor.getByIdOrSlug<Note>(id);
    expect(copied.state.auth).toEqual(expected.state.auth);
    expect(copied.state.global).toEqual(expected.state.global);
    const duplicate = await replica.reactor.load(
      id,
      "main",
      history.auth.results,
    );
    expect((await replica.read.waitForJob(duplicate.id)).status).toBe(
      JobStatus.READ_READY,
    );
    expect((await replica.reactor.getByIdOrSlug<Note>(id)).state.auth).toEqual(
      expected.state.auth,
    );
    expect(
      (
        await executeAs(
          replica,
          "owner",
          id,
          referenceNote.actions.setTitle({ title: "Revoked edit" }),
        )
      ).status,
    ).toBe(JobStatus.FAILED);
  }, 60_000);

  it("keeps ownership separate from service signing, checks locks, hides private snapshots, and preserves revocation on restart", async () => {
    const { host, database, bindingCalls } = await build();
    const draft = referenceNote.utils.createDocument();
    draft.state.global.title = "Owner's private note";
    const creation = await host.write.createWithInitialAuth(draft, {
      requester: requester("owner"),
      idempotencyKey: "new-note",
      context: "company-a",
    });
    const receipt = await creation.readable;
    const id = receipt.documentId;
    expect(bindingCalls).toEqual(["note:authorize", "note:resolve"]);
    expect(
      new Set(receipt.token.coordinates.map((coordinate) => coordinate.scope)),
    ).toEqual(new Set(["document", "auth"]));
    const stored = await host.reactor.getByIdOrSlug<Note>(id);
    expect(stored.state.auth.version).toBe(1);
    expect(stored.state.auth.creator).toBeUndefined();
    expect(
      stored.state.auth.grants.find((grant) => grant.id === "owner-title")
        ?.principal,
    ).toEqual({ address: address("owner") });

    const owned = await creation.document<Note>({
      subject: requester("owner"),
    });
    expect(owned.state.global.title).toBe("Owner's private note");
    expect(owned.state).not.toHaveProperty("local");
    expect(
      (await creation.document({ subject: requester("service") })).state,
    ).not.toHaveProperty("global");
    expect(
      (await creation.document({ subject: requester("outsider") })).state,
    ).not.toHaveProperty("global");

    const ownerHistory = await host.read.getOperations(id, {
      scopes: ["document"],
      subject: requester("owner"),
    });
    expect(JSON.stringify(ownerHistory)).not.toContain("PRIVATE_INITIAL_DRAFT");
    const adminHistory = await host.read.getOperations(id, {
      scopes: ["document"],
      subject: requester("administrator"),
    });
    expect(JSON.stringify(adminHistory)).toContain("PRIVATE_INITIAL_DRAFT");

    expect(
      (
        await executeAs(
          host,
          "owner",
          id,
          referenceNote.actions.setTitle({ title: "Edited" }),
        )
      ).status,
    ).toBe(JobStatus.READ_READY);
    expect(
      (
        await executeAs(
          host,
          "outsider",
          id,
          referenceNote.actions.setTitle({ title: "Stolen" }),
        )
      ).status,
    ).toBe(JobStatus.FAILED);
    expect(
      (await executeAs(host, "owner", id, referenceNote.actions.archive()))
        .status,
    ).toBe(JobStatus.FAILED);
    expect(
      (
        await executeAs(
          host,
          "service",
          id,
          setGrant({
            grant: {
              id: "takeover",
              description: "Attempt to take over",
              effect: "allow",
              principal: { address: address("service") },
              capability: { can: "execute", scope: "auth" },
            },
          }),
        )
      ).status,
    ).toBe(JobStatus.FAILED);
    expect(
      (
        await executeAs(
          host,
          "administrator",
          id,
          referenceNote.actions.setLocked({ locked: true }),
        )
      ).status,
    ).toBe(JobStatus.READ_READY);
    expect(
      (
        await executeAs(
          host,
          "owner",
          id,
          referenceNote.actions.setTitle({ title: "After lock" }),
        )
      ).status,
    ).toBe(JobStatus.FAILED);
    expect(
      (await host.read.get<Note>(id, { subject: requester("owner") })).state
        .global.title,
    ).toBe("Edited");

    expect(
      (
        await executeAs(
          host,
          "administrator",
          id,
          removeGrant({ id: "owner-read" }),
        )
      ).status,
    ).toBe(JobStatus.READ_READY);
    expect(
      (await host.read.get(id, { subject: requester("owner") })).state,
    ).not.toHaveProperty("global");
    await host.reactor.kill().completed;
    hosts.delete(host);
    const restarted = (await build(database)).host;
    const reloaded = await restarted.reactor.getByIdOrSlug<Note>(id);
    expect(reloaded.state.global).toMatchObject({
      title: "Edited",
      locked: true,
    });
    expect(
      reloaded.state.auth.grants.some((grant) => grant.id === "owner-read"),
    ).toBe(false);
    expect(
      (await restarted.read.get(id, { subject: requester("owner") })).state,
    ).not.toHaveProperty("global");
    const retriedCreation = await restarted.write.createWithInitialAuth(draft, {
      requester: requester("owner"),
      idempotencyKey: "new-note",
      context: "company-a",
    });
    expect((await retriedCreation.readable).documentId).toBe(id);
    const afterRetry = await restarted.reactor.getByIdOrSlug<Note>(id);
    expect(afterRetry.state.auth).toEqual(reloaded.state.auth);
    expect(afterRetry.state.global).toEqual(reloaded.state.global);
  }, 60_000);

  it("keeps an invitation inaccessible until a service-authorized claim and never grants ownership to the initializer", async () => {
    const { host } = await build();
    const creation = await host.write.createWithInitialAuth(
      referenceProfile.utils.createDocument(),
      {
        requester: requester("service"),
        idempotencyKey: "invitation",
        context: "company-a",
      },
    );
    const { documentId: id } = await creation.readable;
    expect((await creation.document({ subject: {} })).state).not.toHaveProperty(
      "global",
    );
    expect(
      (await creation.document({ subject: requester("owner") })).state,
    ).not.toHaveProperty("global");
    expect(
      (
        await executeAs(
          host,
          "owner",
          id,
          referenceProfile.actions.claim({ ownerAddress: address("owner") }),
        )
      ).status,
    ).toBe(JobStatus.FAILED);
    expect(
      (
        await executeAs(
          host,
          "service",
          id,
          referenceProfile.actions.claim({ ownerAddress: address("owner") }),
        )
      ).status,
    ).toBe(JobStatus.READ_READY);
    expect(
      (
        await executeAs(
          host,
          "owner",
          id,
          referenceProfile.actions.setDisplayName({ displayName: "Alice" }),
        )
      ).status,
    ).toBe(JobStatus.READ_READY);
    expect(
      (await host.read.get<Profile>(id, { subject: requester("owner") })).state
        .global,
    ).toEqual({ ownerAddress: address("owner"), displayName: "Alice" });
    expect(
      (await host.read.get(id, { subject: requester("outsider") })).state,
    ).not.toHaveProperty("global");
    expect(
      (
        await executeAs(
          host,
          "service",
          id,
          referenceProfile.actions.claim({ ownerAddress: address("outsider") }),
        )
      ).status,
    ).toBe(JobStatus.FAILED);
    expect(
      (await host.reactor.getByIdOrSlug<Profile>(id)).state.auth.creator,
    ).toBeUndefined();
  }, 60_000);

  it("uses the existing manually initialized group and enforces tenant membership and processing attempts", async () => {
    const { host, setCompanyGroup } = await build();
    const groupCreation = await host.write.createEmpty(groupDocumentType);
    const groupReceipt = await groupCreation.readable;
    const groupId = groupReceipt.documentId;
    setCompanyGroup(groupId);
    expect((await groupCreation.document()).state.auth.version).toBe(0);
    expect(
      (
        await executeAs(
          host,
          "service",
          groupId,
          initializeAuth({
            version: 1,
            grants: [
              {
                id: "administrator",
                description: "Company administrator",
                effect: "allow",
                principal: { address: address("administrator") },
                capability: { can: "execute", scope: "*" },
              },
            ],
          }),
        )
      ).status,
    ).toBe(JobStatus.READ_READY);
    expect(
      (
        await executeAs(
          host,
          "administrator",
          groupId,
          referenceCompanyGroup.actions.addMember({
            address: address("owner"),
          }),
        )
      ).status,
    ).toBe(JobStatus.READ_READY);

    const creation = await host.write.createWithInitialAuth(
      referenceStatement.utils.createDocument(),
      {
        requester: requester("owner"),
        idempotencyKey: "statement",
        context: "company-a",
      },
    );
    const { documentId: id } = await creation.readable;
    expect(
      (await creation.document<Statement>({ subject: requester("owner") }))
        .state.global.companyId,
    ).toBe("company-a");
    expect(
      (await creation.document({ subject: requester("outsider") })).state,
    ).not.toHaveProperty("global");
    expect(
      (
        await executeAs(
          host,
          "worker",
          id,
          referenceStatement.actions.start({ generation: "g1", attempt: 1 }),
        )
      ).status,
    ).toBe(JobStatus.FAILED);
    expect(
      (
        await executeAs(
          host,
          "service",
          id,
          referenceStatement.actions.start({ generation: "g2", attempt: 2 }),
        )
      ).status,
    ).toBe(JobStatus.READ_READY);
    expect(
      (
        await executeAs(
          host,
          "worker",
          id,
          referenceStatement.actions.complete({
            generation: "g1",
            attempt: 2,
            total: 42,
          }),
        )
      ).status,
    ).toBe(JobStatus.FAILED);
    expect(
      (
        await executeAs(
          host,
          "worker",
          id,
          referenceStatement.actions.complete({
            generation: "g2",
            attempt: 1,
            total: 42,
          }),
        )
      ).status,
    ).toBe(JobStatus.FAILED);
    expect(
      (
        await executeAs(
          host,
          "owner",
          id,
          referenceStatement.actions.complete({
            generation: "g2",
            attempt: 2,
            total: 42,
          }),
        )
      ).status,
    ).toBe(JobStatus.FAILED);
    const invalidResult = await executeAs(
      host,
      "worker",
      id,
      referenceStatement.actions.complete({
        generation: "g2",
        attempt: 2,
        total: -1,
      }),
    );
    expect(invalidResult.status).toBe(JobStatus.READ_READY);
    expect(invalidResult.result?.allApplied).toBe(false);
    expect(
      (await host.read.get<Statement>(id, { subject: requester("worker") }))
        .state.global,
    ).toMatchObject({ status: "PROCESSING", total: 0 });
    expect(
      (
        await executeAs(
          host,
          "worker",
          id,
          referenceStatement.actions.complete({
            generation: "g2",
            attempt: 2,
            total: 42,
          }),
        )
      ).status,
    ).toBe(JobStatus.READ_READY);
    expect(
      (await host.read.get<Statement>(id, { subject: requester("worker") }))
        .state.global,
    ).toMatchObject({ status: "COMPLETE", total: 42 });
    expect(
      (
        await executeAs(
          host,
          "worker",
          id,
          referenceStatement.actions.complete({
            generation: "g2",
            attempt: 2,
            total: 99,
          }),
        )
      ).status,
    ).toBe(JobStatus.FAILED);

    expect(
      (
        await executeAs(
          host,
          "administrator",
          groupId,
          referenceCompanyGroup.actions.removeMember({
            address: address("owner"),
          }),
        )
      ).status,
    ).toBe(JobStatus.READ_READY);
    await expect
      .poll(
        async () =>
          (await host.read.get(id, { subject: requester("owner") })).state,
      )
      .not.toHaveProperty("global");
    expect(
      (await host.read.get<Statement>(id, { subject: requester("worker") }))
        .state.global.total,
    ).toBe(42);
  }, 60_000);

  it("refuses unauthorized creation before resolving bindings and retries an identical intent once", async () => {
    const { host, bindingCalls } = await build();
    await expect(
      host.write.createWithInitialAuth(referenceNote.utils.createDocument(), {
        requester: requester("outsider"),
        idempotencyKey: "unauthorized",
        context: "company-a",
      }),
    ).rejects.toThrow();
    expect(bindingCalls).toEqual(["note:authorize"]);

    const draft = referenceNote.utils.createDocument();
    const request = {
      requester: requester("owner"),
      idempotencyKey: "retry",
      context: "company-a",
    };
    const first = await host.write.createWithInitialAuth(draft, request);
    const firstReceipt = await first.readable;
    const retry = await host.write.createWithInitialAuth(draft, request);
    const retryReceipt = await retry.readable;
    expect(retryReceipt.documentId).toBe(firstReceipt.documentId);
    const operations = await host.reactor.getOperations(
      firstReceipt.documentId,
      { scopes: ["document", "auth"] },
    );
    expect(
      operations.document.results.map((operation) => operation.action.type),
    ).toEqual(["CREATE_DOCUMENT", "UPGRADE_DOCUMENT"]);
    expect(
      operations.auth.results.map((operation) => operation.action.type),
    ).toEqual(["INITIALIZE_AUTH"]);
    const changed = structuredClone(draft);
    changed.state.global.title = "A different request";
    await expect(
      host.write.createWithInitialAuth(changed, request),
    ).rejects.toThrow();
    expect(
      (await host.reactor.getByIdOrSlug<Note>(firstReceipt.documentId)).state
        .global.title,
    ).toBe("Draft");
  }, 60_000);
});
