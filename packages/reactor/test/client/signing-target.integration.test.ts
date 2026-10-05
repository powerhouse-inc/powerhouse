import type { ActionSigningTarget } from "@powerhousedao/shared/document-model";
import { actions } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IReactorClient } from "../../src/client/types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { createDocModelDocument } from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";

describe("ReactorClient signs for the document a write is stored under", () => {
  let client: IReactorClient;
  let reactor: IReactor;
  let targets: ActionSigningTarget[];

  beforeEach(async () => {
    targets = [];
    const signer = (await TestP256Signer.create()).asISigner(targets);
    client = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([documentModelDocumentModelModule])
          .withExecutorConfig({ signatureVerification: "enforce" }),
      )
      .withSigner(signer)
      .build();
    reactor = (client as unknown as { reactor: IReactor }).reactor;
  });

  afterEach(() => {
    reactor.kill();
  });

  async function createWithSlug(): Promise<string> {
    const document = createDocModelDocument({ slug: "my-slug" });
    await client.create(document);
    targets.length = 0;
    return document.header.id;
  }

  it("resolves a slug passed to execute before signing", async () => {
    const id = await createWithSlug();

    const result = await client.execute("my-slug", "main", [
      actions.setName("renamed"),
    ]);

    expect(result.header.id).toBe(id);
    expect(targets).toEqual([{ documentId: id, branch: "main" }]);
    const operations = await reactor.getOperations(id);
    expect(operations.global.results.at(-1)?.action.input).toEqual({
      name: "renamed",
    });
  });

  it("resolves a slug in an executeBatch job before signing", async () => {
    const id = await createWithSlug();

    await client.executeBatch({
      jobs: [
        {
          key: "rename",
          documentId: "my-slug",
          scope: "global",
          branch: "main",
          actions: [actions.setName("batched")],
          dependsOn: [],
        },
      ],
    });

    expect(targets).toEqual([{ documentId: id, branch: "main" }]);
  });

  it("signs a create for its own id and header branch", async () => {
    const document = createDocModelDocument();

    await client.create(document);

    expect(targets).toEqual([
      { documentId: document.header.id, branch: "main" },
      { documentId: document.header.id, branch: "main" },
    ]);
  });
});
