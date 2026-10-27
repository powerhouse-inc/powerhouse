import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactorClient } from "../../src/client/reactor-client.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { TestP256Signer } from "../utils/p256-signer.js";

const DOCUMENT_MODEL = "powerhouse/document-model";

describe("a new document's header revision", () => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    for (const reactor of reactors.splice(0)) {
      reactor.kill();
    }
  });

  async function client(): Promise<ReactorClient> {
    const built = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          driveDocumentModelModule as never,
          documentModelDocumentModelModule,
        ]),
      )
      .withSigner((await TestP256Signer.create()).asISigner())
      .buildModule();
    reactors.push(built.reactor);
    return built.client;
  }

  it("counts 0 for each model scope without operations", async () => {
    const reactor = await client();

    const created = await reactor.createEmpty(DOCUMENT_MODEL);
    const read = await reactor.get(created.header.id);

    expect(read.header.revision).toEqual({
      document: read.header.revision.document,
      global: 0,
      local: 0,
    });
    expect(read.header.revision.document).toBeGreaterThan(0);
    expect(read.header.revision).not.toHaveProperty("auth");
  });

  it("counts the operations of a scope once it has them", async () => {
    const reactor = await client();

    const created = await reactor.createEmpty(DOCUMENT_MODEL);
    const handle = await reactor.write.execute(created.header.id, "main", [
      documentModelDocumentModelModule.actions.setModelName({ name: "Named" }),
    ]);
    const executed = await handle.document();
    const [read] = await reactor.getMany([created.header.id]);

    expect(executed.header.revision.global).toBe(1);
    expect(executed.header.revision.local).toBe(0);
    expect(read.header.revision).toEqual(executed.header.revision);
  });

  it("reads the same counts for a drive", async () => {
    const reactor = await client();

    const drive = await reactor.drives.create({ global: { name: "Drive" } });
    const read = await reactor.get(drive.header.id);

    expect(read.header.revision.local).toBe(0);
    expect(read.header.revision.global).toBeGreaterThanOrEqual(0);
  });
});
