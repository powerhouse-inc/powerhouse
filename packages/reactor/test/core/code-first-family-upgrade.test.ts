import { PGlite } from "@electric-sql/pglite";
import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import { HardenedPGliteDialect } from "../../src/storage/kysely/pglite-dialect.js";
import type { Database } from "../../src/core/types.js";
import { TestP256Signer } from "../utils/p256-signer.js";
import {
  ledgerV1,
  ledgerV2,
  upgradeManifest,
} from "./fixtures/code-first-ledger.js";

type Creator = (input: unknown) => Action;
const v1 = ledgerV1.actions as unknown as Record<string, Creator>;
const v2 = ledgerV2.actions as unknown as Record<string, Creator>;

async function reactorOn(db: Kysely<Database>) {
  return new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([ledgerV1, ledgerV2])
        .withUpgradeManifests([upgradeManifest])
        .withKysely(db),
    )
    .withSigner((await TestP256Signer.create()).asISigner())
    .buildModule();
}

const view = (document: PHDocument) => ({
  version: (document.state as unknown as { document: { version: number } })
    .document.version,
  global: (document.state as unknown as { global: unknown }).global,
});

describe("a persisted v1 code-first family document", () => {
  it("upgrades to v2, takes a v2 operation and reloads in a second reactor", async () => {
    const db = new Kysely<Database>({
      dialect: new HardenedPGliteDialect(new PGlite()),
    });
    const first = await reactorOn(db);
    const created = await first.client.createEmpty("test/ledger", {
      documentModelVersion: 1,
    });
    const id = created.header.id;
    await first.client.execute(id, "main", [v1.addAmount({ amount: 5 })]);
    expect(view(await first.client.get(id))).toStrictEqual({
      version: 1,
      global: { total: 5 },
    });

    expect(view(await first.client.upgradeDocument(id, 2))).toStrictEqual({
      version: 2,
      global: { total: 5, currency: "USD" },
    });
    await first.client.execute(id, "main", [
      v2.setCurrency({ currency: "EUR" }),
    ]);
    const live = view(await first.client.get(id));
    expect(live).toStrictEqual({
      version: 2,
      global: { total: 5, currency: "EUR" },
    });
    await first.reactor.kill().completed;

    const second = await reactorOn(db);
    try {
      expect(view(await second.client.get(id))).toStrictEqual(live);
      await second.client.execute(id, "main", [v2.addAmount({ amount: 2 })]);
      expect(view(await second.client.get(id))).toStrictEqual({
        version: 2,
        global: { total: 7, currency: "EUR" },
      });
    } finally {
      await second.reactor.kill().completed;
    }
  }, 60_000);
});
