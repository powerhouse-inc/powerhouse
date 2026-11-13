import { PGlite } from "@electric-sql/pglite";
import {
  authAddress,
  createZip,
  initializeAuth,
  removeGrant,
  type Operation,
  type UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  materialize,
  ph,
} from "document-model";
import { Kysely } from "kysely";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
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

function contextAt<const V extends number>(id: string, version: V) {
  const model = defineDocumentModel({
    id,
    version,
    name: "Lifecycle note",
    description: "",
    extension: "note",
    author: { name: "Reference application" },
    scopes: {
      global: {
        schema: ph.object("LifecycleNoteState", {
          fields: { title: ph.String({ required: true }) },
        }),
        initialValue: { title: "Draft" },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const content = model.module("content", {
    operations: ({ global }) => ({
      setTitle: global({
        input: ph.input({ fields: { title: ph.String({ required: true }) } }),
        reduce(state, input) {
          state.title = input.title;
        },
      }),
    }),
  });
  return { model, content };
}

function legacyVersion<const V extends number>(id: string, version: V) {
  const { model, content } = contextAt(id, version);
  return model.version({ modules: [content] });
}

function protectedVersion<const V extends number>(id: string, version: V) {
  const { model, content } = contextAt(id, version);
  return model.version({
    modules: [content],
    auth: ({ operations, scopes, platform, policy: p }) => {
      const bindings = p.bindings({
        administrator: p.addressBinding({ source: "deployment" }),
        owner: p.addressBinding({ source: "instance" }),
      });
      return p.initial({
        version: 1,
        bindings,
        grants: [
          p.allow({
            id: "administrator-access",
            description: "Manage policy",
            principal: bindings.administrator,
            target: p.executeMany([
              platform.auth.setGrant,
              platform.auth.removeGrant,
              platform.auth.moveGrant,
            ]),
          }),
          p.allow({
            id: "administrator-content",
            description: "Manage content",
            principal: bindings.administrator,
            target: p.allOperations(scopes.global),
          }),
          p.allow({
            id: "administrator-local",
            description: "Read local",
            principal: bindings.administrator,
            target: p.read(scopes.local),
          }),
          p.allow({
            id: "administrator-upgrade",
            description: "Upgrade",
            principal: bindings.administrator,
            target: p.execute(platform.document.upgradeDocument),
          }),
          p.allow({
            id: "owner-title",
            description: "Edit title",
            principal: bindings.owner,
            target: p.execute(operations.content.setTitle),
          }),
        ],
      });
    },
  });
}

function manifestFor(documentType: string): UpgradeManifest<readonly [1, 2]> {
  return {
    documentType,
    latestVersion: 2,
    supportedVersions: [1, 2],
    upgrades: { v2: { toVersion: 2, upgradeReducer: (document) => document } },
  };
}

const adoptingId = "initial-auth/family-adopting";
const retiringId = "initial-auth/family-retiring";
const adopting = materialize(
  defineDocumentModelFamily({
    versions: [legacyVersion(adoptingId, 1), protectedVersion(adoptingId, 2)],
    upgradeManifest: manifestFor(adoptingId),
  }),
);
const retiring = materialize(
  defineDocumentModelFamily({
    versions: [protectedVersion(retiringId, 1), legacyVersion(retiringId, 2)],
    upgradeManifest: manifestFor(retiringId),
  }),
);

describe("initial authorization across model family versions", () => {
  let signer: ReturnType<TestP256Signer["asISigner"]>;
  const hosts: InProcessReactorClientModule[] = [];
  const databases: Kysely<Database>[] = [];
  beforeAll(async () => {
    signer = (await TestP256Signer.create()).asISigner([], {
      address: "administrator",
      networkId: "eip155",
      chainId: 1,
    });
  });
  afterEach(async () => {
    for (const host of hosts.splice(0)) {
      await host.reactorModule?.readModelCoordinator.drain();
      await host.reactor.kill().completed;
    }
    for (const database of databases.splice(0)) await database.destroy();
  });
  async function build() {
    let resolutions = 0;
    let copies = 0;
    const database = new Kysely<Database>({
      dialect: new HardenedPGliteDialect(new PGlite()),
    });
    databases.push(database);
    const host = await new ReactorClientBuilder()
      .withSigner(signer)
      .withReactorBuilder(
        new ReactorBuilder()
          .withKysely(database)
          .withDocumentModelSources([...adopting.modules, ...retiring.modules])
          .withUpgradeManifests([
            manifestFor(adoptingId),
            manifestFor(retiringId),
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
            providers: [adopting.at(2), retiring.at(1)].map((model) =>
              defineInitialAuthProvider(model, {
                deployment: { administrator: authAddress("administrator") },
                authorizeCreation() {},
                resolveInstance() {
                  resolutions++;
                  return { owner: authAddress("owner") };
                },
              }),
            ),
            trustOrigin: () => true,
            authorizeCopy({ requester }) {
              if (requester.address !== "administrator")
                throw new Error("Only an administrator can copy");
              copies++;
            },
          }),
      )
      .buildModule();
    hosts.push(host);
    return { host, resolutions: () => resolutions, copies: () => copies };
  }
  async function history(host: InProcessReactorClientModule, id: string) {
    if (!host.reactorModule) throw new Error("Expected local host");
    const operations: Record<string, Operation[]> = {};
    for (const scope of ["document", "auth", "global", "local"])
      operations[scope] = (
        await host.reactorModule.operationStore.getSince(id, scope, "main", -1)
      ).results;
    return operations;
  }

  it("keeps explicit legacy creation and manual policies unchanged when upgrading to a templated version", async () => {
    const { host, resolutions } = await build();
    const empty = await host.client.createEmpty(adoptingId, {
      documentModelVersion: 1,
    });
    expect(empty.header.initialAuth).toBeUndefined();
    expect(empty.state.auth.version).toBe(0);
    const upgradedEmpty = await host.client.upgradeDocument(empty.header.id, 2);
    expect(upgradedEmpty.state.auth).toEqual(empty.state.auth);
    expect(upgradedEmpty.header.initialAuth).toBeUndefined();
    const manual = await host.client.createEmpty(adoptingId, {
      documentModelVersion: 1,
    });
    await host.client.execute(manual.header.id, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "manual-administrator",
            description: "Existing manual policy",
            effect: "allow",
            principal: { address: "administrator" },
            capability: { can: "execute", scope: "*" },
          },
        ],
      }),
    ]);
    const policy = (await host.client.get(manual.header.id)).state.auth;
    const upgradedManual = await host.client.upgradeDocument(
      manual.header.id,
      2,
    );
    expect(upgradedManual.state.auth).toEqual(policy);
    expect(resolutions()).toBe(0);
    const newest = await host.write.createEmpty(adoptingId);
    expect((await newest.document()).header.initialAuth?.modelVersion).toBe(2);
    expect(resolutions()).toBe(1);
  });

  it("accepts split legacy creation but refuses a standalone initial upgrade into a templated version", async () => {
    const source = (await build()).host;
    const receiver = (await build()).host;
    const bypass = (await build()).host;
    const original = await source.client.createEmpty(adoptingId, {
      documentModelVersion: 1,
    });
    const id = original.header.id;
    const operations = (await history(source, id)).document;
    expect(operations).toHaveLength(2);
    for (const host of [receiver, bypass]) {
      const job = await host.reactor.load(id, "main", [operations[0]]);
      expect((await host.read.waitForJob(job.id)).status).toBe(
        JobStatus.READ_READY,
      );
    }
    const valid = await receiver.reactor.load(id, "main", [operations[1]]);
    expect((await receiver.read.waitForJob(valid.id)).status).toBe(
      JobStatus.READ_READY,
    );
    expect((await receiver.client.get(id)).state.auth.version).toBe(0);
    const upgrade = operations[1].action;
    if (upgrade.input === null || typeof upgrade.input !== "object")
      throw new Error("Expected upgrade input");
    const unsigned = { ...upgrade, input: { ...upgrade.input, toVersion: 2 } };
    const rejected = await bypass.reactor.execute(
      id,
      "main",
      await signActions([unsigned], signer, { documentId: id, branch: "main" }),
    );
    expect((await bypass.read.waitForJob(rejected.id)).status).toBe(
      JobStatus.FAILED,
    );
    expect((await history(bypass, id)).document).toHaveLength(1);
  });

  it("preserves revocations through upgrade, archive import and copy when the current version removes defaults", async () => {
    const source = await build();
    const receiver = await build();
    const original = await source.host.client.createEmpty(retiringId, {
      documentModelVersion: 1,
    });
    const id = original.header.id;
    await source.host.client.execute(id, "main", [
      removeGrant({ id: "owner-title" }),
    ]);
    const revoked = (await source.host.client.get(id)).state.auth;
    const upgraded = await source.host.client.upgradeDocument(id, 2);
    expect(upgraded.state.auth).toEqual(revoked);
    expect(upgraded.header.initialAuth?.modelVersion).toBe(1);
    upgraded.operations = await history(source.host, id);
    const archive = await retiring
      .at(2)
      .utils.loadFromInput(await createZip(upgraded));
    const imported = await receiver.host.write.importWithInitialAuth(archive);
    await imported.readable;
    const reloaded = await receiver.host.client.get(id);
    expect(reloaded.state.document.version).toBe(2);
    expect(reloaded.state.auth).toEqual(revoked);
    expect(receiver.resolutions()).toBe(0);
    const copy = await receiver.host.write.copyWithInitialAuth(id, {
      requester: { address: "administrator" },
      context: "family-copy",
      idempotencyKey: "one",
    });
    await copy.readable;
    const copied = await receiver.host.client.get(copy.documentId);
    expect(copied.state.auth).toEqual(revoked);
    expect(copied.state.document.version).toBe(2);
    expect(copied.header.initialAuth?.kind).toBe("copy");
    expect(receiver.copies()).toBe(1);
    expect(receiver.resolutions()).toBe(0);
    expect(source.resolutions()).toBe(1);
    const plain = await receiver.host.client.createEmpty(retiringId);
    expect(plain.state.auth.version).toBe(0);
    expect(plain.header.initialAuth).toBeUndefined();
  });
});
