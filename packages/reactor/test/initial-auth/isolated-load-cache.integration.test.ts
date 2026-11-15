import { z } from "zod";
import { PGlite } from "@electric-sql/pglite";
import {
  authAddress,
  type Action,
  type ISigner,
} from "@powerhousedao/shared/document-model";
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
import { referenceCompanyGroup, referenceNote } from "./reference-app.js";

describe("initial authorization facts after isolated loads", () => {
  const locked = (state: unknown) =>
    z.object({ global: z.object({ locked: z.boolean() }) }).parse(state).global
      .locked;
  const members = (state: unknown) =>
    z
      .object({ global: z.object({ members: z.array(z.string()) }) })
      .parse(state).global.members;
  let signer: ISigner;
  const hosts: InProcessReactorClientModule[] = [];
  const databases = new Set<Kysely<Database>>();
  beforeAll(async () => {
    signer = (await TestP256Signer.create()).asISigner([], {
      address: "administrator",
      networkId: "eip155",
      chainId: 1,
    });
  });
  afterEach(async () => {
    for (const host of hosts.splice(0).reverse())
      await host.reactor.kill().completed;
    for (const database of databases) await database.destroy();
    databases.clear();
  });
  async function build(existing?: Kysely<Database>) {
    const database =
      existing ??
      new Kysely<Database>({
        dialect: new HardenedPGliteDialect(new PGlite()),
      });
    databases.add(database);
    let factId: string | undefined;
    const host = await new ReactorClientBuilder()
      .withSigner(signer)
      .withReactorBuilder(
        new ReactorBuilder()
          .withKysely(database)
          .withDocumentModelSources([referenceNote, referenceCompanyGroup])
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
                async authorizeCreation({ read }) {
                  if (factId && locked((await read(factId)).state))
                    throw new Error("Creation fact is locked");
                },
                resolveInstance: () => ({ owner: authAddress("owner") }),
              }),
            ],
            trustOrigin: () => true,
          }),
      )
      .buildModule();
    hosts.push(host);
    if (!host.reactorModule) throw new Error("Expected a local reactor");
    return {
      host,
      database,
      module: host.reactorModule,
      requireFact: (id: string) => {
        factId = id;
      },
    };
  }
  async function create(host: InProcessReactorClientModule, key: string) {
    const handle = await host.write.createWithInitialAuth(
      referenceNote.utils.createDocument(),
      {
        requester: { address: "owner" },
        context: "facts",
        idempotencyKey: key,
      },
    );
    return (await handle.readable).documentId;
  }
  async function execute(
    host: InProcessReactorClientModule,
    id: string,
    action: Action,
  ) {
    const signed = await signActions([action], signer, {
      documentId: id,
      branch: "main",
    });
    const job = await host.reactor.execute(id, "main", signed);
    expect((await host.read.waitForJob(job.id)).status).toBe(
      JobStatus.READ_READY,
    );
  }
  async function load(
    host: InProcessReactorClientModule,
    source: InProcessReactorClientModule,
    id: string,
    scope?: string,
  ) {
    const history = await source.reactor.getOperations(id);
    const operations = scope
      ? history[scope].results
      : [
          ...history.document.results,
          ...Object.entries(history)
            .filter(([name]) => name !== "document")
            .flatMap(([, page]) => page.results),
        ];
    const job = await host.reactor.load(id, "main", operations);
    expect((await host.read.waitForJob(job.id)).status).toBe(
      JobStatus.READ_READY,
    );
  }
  it("publishes ordinary replicated state to warmed public caches before authorizing another creation", async () => {
    const a = await build();
    const b = await build();
    const id = await create(a.host, "source");
    await load(b.host, a.host, id);
    expect(
      locked((await b.module.writeCache.getState(id, "global", "main")).state),
    ).toBe(false);
    await execute(
      a.host,
      id,
      referenceNote.actions.setLocked({ locked: true }),
    );
    await load(b.host, a.host, id, "global");
    expect(
      locked((await b.module.writeCache.getState(id, "global", "main")).state),
    ).toBe(true);
    b.requireFact(id);
    await expect(create(b.host, "child")).rejects.toThrow(
      "Creation fact is locked",
    );
  });
  it("pins provider facts to storage revisions when another reactor changes a warmed head", async () => {
    const a = await build();
    const id = await create(a.host, "source");
    const b = await build(a.database);
    expect(
      locked((await b.module.writeCache.getState(id, "global", "main")).state),
    ).toBe(false);
    await execute(
      a.host,
      id,
      referenceNote.actions.setLocked({ locked: true }),
    );
    b.requireFact(id);
    await expect(create(b.host, "child")).rejects.toThrow(
      "Creation fact is locked",
    );
  });
  it("preserves ordinary model cache updates on a host configured for initial authorization", async () => {
    const a = await build();
    const b = await build();
    const handle = await a.host.write.create(
      referenceCompanyGroup.utils.createDocument(),
    );
    const id = (await handle.readable).documentId;
    await load(b.host, a.host, id);
    expect(
      members((await b.module.writeCache.getState(id, "global", "main")).state),
    ).toEqual([]);
    await execute(
      a.host,
      id,
      referenceCompanyGroup.actions.addMember({ address: "new-member" }),
    );
    await load(b.host, a.host, id, "global");
    expect(
      members((await b.module.writeCache.getState(id, "global", "main")).state),
    ).toEqual(["new-member"]);
  });
});
