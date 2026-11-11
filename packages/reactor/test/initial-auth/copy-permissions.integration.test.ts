import { PGlite } from "@electric-sql/pglite";
import { authAddress, setGrant } from "@powerhousedao/shared/document-model";
import { Kysely } from "kysely";
import { expect, it } from "vitest";
import {
  defineInitialAuthProvider,
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "../../index.js";
import type { Database } from "../../src/core/types.js";
import { HardenedPGliteDialect } from "../../src/storage/kysely/pglite-dialect.js";
import { TestP256Signer } from "../utils/p256-signer.js";
import { referenceNote, referenceCompanyGroup } from "./reference-app.js";

it("checks copy read permissions against group facts that survive until commit", async () => {
  const signer = (await TestP256Signer.create()).asISigner([], {
    address: "administrator",
    networkId: "eip155",
    chainId: 1,
  });
  const database = new Kysely<Database>({
    dialect: new HardenedPGliteDialect(new PGlite()),
  });
  let onAuthorize: (() => Promise<void>) | undefined;
  let host: InProcessReactorClientModule | undefined;
  const provider = defineInitialAuthProvider(referenceNote, {
    deployment: { administrator: authAddress("administrator") },
    async authorizeCreation() {
      await onAuthorize?.();
    },
    resolveInstance: () => ({ owner: authAddress("owner") }),
  });
  try {
    host = await new ReactorClientBuilder()
      .withSigner(signer)
      .withReactorBuilder(
        new ReactorBuilder()
          .withKysely(database)
          .withDocumentModelSources([referenceNote, referenceCompanyGroup])
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
          .withInitialAuth({ providers: [provider], trustOrigin: () => true }),
      )
      .buildModule();
    const client = host;
    const groupId = (
      await (
        await client.write.create(referenceCompanyGroup.utils.createDocument())
      ).readable
    ).documentId;
    await (
      await client.write.execute(groupId, "main", [
        referenceCompanyGroup.actions.addMember({ address: "owner" }),
      ])
    ).readable;
    const sourceId = (
      await (
        await client.write.createWithInitialAuth(
          referenceNote.utils.createDocument(),
          {
            requester: { address: "owner" },
            context: "app",
            idempotencyKey: "source",
          },
        )
      ).readable
    ).documentId;
    await (
      await client.write.execute(sourceId, "main", [
        setGrant({
          grant: {
            id: "group-draft",
            description: "Members can read the draft",
            effect: "allow",
            principal: { group: groupId },
            capability: { can: "read", scope: "local" },
          },
        }),
      ])
    ).readable;
    const valid = await client.write.copyWithInitialAuth(sourceId, {
      requester: { address: "owner" },
      context: "app",
      idempotencyKey: "valid",
    });
    await valid.readable;
    expect(
      (await valid.document({ subject: { address: "owner" } })).state,
    ).toHaveProperty("local");
    onAuthorize = async () => {
      await (
        await client.write.execute(groupId, "main", [
          referenceCompanyGroup.actions.removeMember({ address: "owner" }),
        ])
      ).readable;
    };
    const raced = await client.write.copyWithInitialAuth(sourceId, {
      requester: { address: "owner" },
      context: "app",
      idempotencyKey: "raced",
    });
    await expect(raced.readable).rejects.toThrow("authorization fact changed");
    await expect(
      client.reactor.getByIdOrSlug(raced.documentId),
    ).rejects.toThrow();
    expect(
      (await client.read.get(sourceId, { subject: { address: "owner" } }))
        .state,
    ).not.toHaveProperty("local");
    onAuthorize = undefined;
    await (
      await client.write.execute(sourceId, "main", [
        setGrant({
          grant: {
            id: "missing-group",
            description: "Unavailable group",
            effect: "allow",
            principal: { group: "unavailable-group" },
            capability: { can: "read", scope: "global" },
          },
        }),
      ])
    ).readable;
    await expect(
      client.write.copyWithInitialAuth(sourceId, {
        requester: { address: "administrator" },
        context: "app",
        idempotencyKey: "missing-group",
      }),
    ).rejects.toThrow();
  } finally {
    await host?.reactor.kill().completed;
    await database.destroy();
  }
}, 60_000);
