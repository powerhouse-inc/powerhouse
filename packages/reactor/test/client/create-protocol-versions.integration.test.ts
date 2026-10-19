import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  createPresignedHeader,
  protocolVersionsFor,
  setModelName,
  type DocumentModelModule,
  type PHDocument,
  type Reducer,
  type SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import {
  ConsoleLogger,
  documentModelDocumentModelModule,
} from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactorClient } from "../../src/client/reactor-client.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { InProcessReactorModule, IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import { TestP256Signer } from "../utils/p256-signer.js";

const DOCUMENT_MODEL = "powerhouse/document-model";

/** Under the default registry every create path heads base-reducer 3. */
describe.each<SignaturePolicy>(["v2-required", "legacy"])(
  "create paths under the default registry (%s)",
  (policy) => {
    const reactors: IReactor[] = [];
    const expected = protocolVersionsFor(policy, { "base-reducer": 3 });

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
        .withCreateSignaturePolicy(policy)
        .buildModule();
      reactors.push(built.reactor);
      return built.client;
    }

    it("selects base-reducer 3 everywhere", async () => {
      const reactor = await client();

      expect(
        await reactor.getCreateProtocolVersions({
          documentType: DOCUMENT_MODEL,
        }),
      ).toEqual({
        "base-reducer": 3,
      });

      const drive = await reactor.drives.create({ global: { name: "Drive" } });
      expect(drive.header.protocolVersions).toEqual(expected);

      const empty = await reactor.createEmpty(DOCUMENT_MODEL);
      expect(empty.header.protocolVersions).toEqual(expected);
      expect(empty.header.protocolVersions).not.toHaveProperty(
        "document-purge",
      );

      const child = await reactor.createEmpty(DOCUMENT_MODEL, {
        parentIdentifier: drive.header.id,
      });
      expect(child.header.protocolVersions).toEqual(expected);

      const file = await reactor.drives.addFile(
        drive.header.id,
        documentModelDocumentModelModule.utils.createDocument(),
      );
      await reactor.drives.copyNode(drive.header.id, file.header.id, undefined);
      const copied = await reactor.get(drive.header.id);
      const copyNode = (
        copied.state as unknown as {
          global: { nodes: Array<{ id: string }> };
        }
      ).global.nodes.find((node) => node.id !== file.header.id)!;
      const copy = await reactor.get(copyNode.id);
      expect(copy.header.protocolVersions).toEqual(
        file.header.protocolVersions,
      );
    });
  },
);

/** The document model under a plain reducer, as a hand-written model has. */
function untaggedDocumentModel(): DocumentModelModule {
  const tagged = documentModelDocumentModelModule.reducer as unknown as Reducer;
  const reducer: Reducer = (...args) => tagged(...args);
  return {
    ...(documentModelDocumentModelModule as unknown as DocumentModelModule),
    reducer,
  };
}

function modelName(document: PHDocument): string {
  return (document.state as unknown as { global: { name: string } }).global
    .name;
}

describe("create paths for a model whose reducer createReducer did not build", () => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    for (const reactor of reactors.splice(0)) {
      reactor.kill();
    }
  });

  async function build() {
    const logger = new ConsoleLogger(["test"]);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const built = await new ReactorClientBuilder()
      .withLogger(logger)
      .withReactorBuilder(
        new ReactorBuilder()
          .withLogger(logger)
          .withDocumentModelSources([
            driveDocumentModelModule as never,
            untaggedDocumentModel(),
          ]),
      )
      .withSigner((await TestP256Signer.create()).asISigner())
      .buildModule();
    reactors.push(built.reactor);
    return {
      client: built.client,
      reactor: built.reactor,
      module: built.reactorModule as InProcessReactorModule,
      warn,
    };
  }

  function unversioned(): PHDocument {
    const document = documentModelDocumentModelModule.utils.createDocument();
    return {
      ...document,
      header: createPresignedHeader(undefined, DOCUMENT_MODEL),
    } as PHDocument;
  }

  it("selects base-reducer 2 for it and 3 for a createReducer model", async () => {
    const { client, reactor, warn } = await build();

    expect(
      await client.getCreateProtocolVersions({ documentType: DOCUMENT_MODEL }),
    ).toEqual({ "base-reducer": 2 });
    expect(
      await client.getCreateProtocolVersions({ documentType: undefined }),
    ).toEqual({ "base-reducer": 3 });

    const drive = await client.drives.create({ global: { name: "Drive" } });
    expect(drive.header.protocolVersions?.["base-reducer"]).toBe(3);

    const empty = await client.createEmpty(DOCUMENT_MODEL);
    expect(empty.header.protocolVersions?.["base-reducer"]).toBe(2);

    const created = await client.create(unversioned());
    expect(created.header.protocolVersions).toEqual({ "base-reducer": 2 });

    const file = await client.drives.addFile(drive.header.id, unversioned());
    expect(file.header.protocolVersions).toEqual({ "base-reducer": 2 });

    const direct = unversioned();
    const job = await reactor.create(direct);
    await vi.waitUntil(async () => {
      const { status } = await reactor.getJobStatus(job.id);
      return status === JobStatus.READ_READY || status === JobStatus.FAILED;
    });
    expect((await reactor.getJobStatus(job.id)).status).toBe(
      JobStatus.READ_READY,
    );
    const stored = await reactor.get(direct.header.id);
    expect(stored.header.protocolVersions).toEqual({ "base-reducer": 2 });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("not built by createReducer"),
      DOCUMENT_MODEL,
    );
  });

  it("selects base-reducer 2 for a type that is not registered", async () => {
    const { client, warn } = await build();

    expect(
      await client.getCreateProtocolVersions({
        documentType: "powerhouse/not-registered",
      }),
    ).toEqual({ "base-reducer": 2 });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("not registered"),
      "powerhouse/not-registered",
    );
  });

  it("rebuilds its documents cold", async () => {
    const { client, module } = await build();
    const document = await client.createEmpty(DOCUMENT_MODEL);
    const id = document.header.id;

    await client.execute(id, "main", [setModelName({ name: "first" })]);
    module.writeCache.clear();
    expect(
      modelName(await module.writeCache.getState(id, "global", "main")),
    ).toBe("first");

    module.writeCache.clear();
    const renamed = await client.execute(id, "main", [
      setModelName({ name: "second" }),
    ]);
    expect(modelName(renamed)).toBe("second");
  });

  it("keeps an explicit base-reducer 3, which cannot rebuild cold", async () => {
    const { client, module } = await build();
    const document = await client.createEmpty(DOCUMENT_MODEL, {
      protocolVersions: { "base-reducer": 3 },
    });
    expect(document.header.protocolVersions?.["base-reducer"]).toBe(3);
    await client.execute(document.header.id, "main", [
      setModelName({ name: "first" }),
    ]);

    module.writeCache.clear();
    await expect(
      module.writeCache.getState(document.header.id, "global", "main"),
    ).rejects.toThrow("not built by createReducer");
  });
});
