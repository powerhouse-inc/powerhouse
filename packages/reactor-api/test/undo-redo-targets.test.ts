import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
  type IReactorClient,
} from "@powerhousedao/reactor";
import {
  setModelName,
  signaturePolicyOf,
  withSignaturePolicy,
  type DocumentModelModule,
  type ProtocolVersions,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as resolvers from "../src/graphql/reactor/resolvers.js";
import { createTestSigner } from "./utils/test-signer.js";

describe("undoRedoTargets resolver", () => {
  it("asks the client as the caller, so the client's read gate decides", async () => {
    const undoRedoTargets = vi
      .fn()
      .mockResolvedValue({ undoTarget: "action-1" });
    const client = { undoRedoTargets } as unknown as IReactorClient;
    const subject = { address: "0xcaller" };

    expect(
      await resolvers.undoRedoTargets(
        client,
        { documentIdOrSlug: "doc-1", scope: "local", branch: null },
        subject,
      ),
    ).toEqual({ undoTarget: "action-1", redoTarget: null });
    expect(undoRedoTargets).toHaveBeenCalledWith("doc-1", "local", {
      branch: undefined,
      subject,
    });
  });
});

describe("undoRedoTargets over a reactor", () => {
  const none = { undoTarget: null, redoTarget: null };
  let module: InProcessReactorClientModule;

  afterEach(() => {
    module.reactor.kill();
  });

  async function createEdited(versions: ProtocolVersions): Promise<string> {
    module = await new ReactorClientBuilder()
      .withSigner(await createTestSigner())
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            documentModelDocumentModelModule as unknown as DocumentModelModule,
          ])
          .withExecutorConfig({ featureFlags: { undoV3: true } }),
      )
      .buildModule();
    const document = withSignaturePolicy(
      documentModelDocumentModelModule.utils.createDocument(),
      signaturePolicyOf(versions),
      { protocolVersions: versions },
    );
    await module.client.create(document);
    const id = document.header.id;
    const stored = await module.client.get(id);
    expect(stored.header.protocolVersions?.["base-reducer"]).toBe(
      versions["base-reducer"],
    );
    await module.client.execute(id, "main", [setModelName({ name: "a" })]);
    await module.client.execute(id, "main", [setModelName({ name: "b" })]);
    return id;
  }

  it("reports none below base-reducer 3", async () => {
    const id = await createEdited({ "base-reducer": 2 });
    await module.client.undo(id);

    expect(
      await resolvers.undoRedoTargets(module.client, { documentIdOrSlug: id }),
    ).toEqual(none);
  });

  it.each(["auth", "document"])(
    "reports none in the %s scope on base-reducer 3",
    async (scope) => {
      const id = await createEdited({ "base-reducer": 3, signature: 2 });

      expect(
        await resolvers.undoRedoTargets(module.client, {
          documentIdOrSlug: id,
          scope,
        }),
      ).toEqual(none);
      expect(
        await resolvers.undoRedoTargets(module.client, {
          documentIdOrSlug: id,
        }),
      ).toEqual({ undoTarget: expect.any(String), redoTarget: null });
    },
  );
});
