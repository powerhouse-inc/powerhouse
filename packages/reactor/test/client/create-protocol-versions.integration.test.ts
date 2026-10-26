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
    const debug = vi.spyOn(logger, "debug").mockImplementation(() => {});
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
      debug,
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
    const { client, warn } = await build();

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

    // The facade's deprecation warnings are not this test's subject.
    const fitWarnings = warn.mock.calls.filter(([message]) =>
      String(message).includes("not built by createReducer"),
    );
    expect(fitWarnings).toEqual([[expect.any(String), DOCUMENT_MODEL]]);
  });

  it("selects base-reducer 2 for a type that is not registered, logging at debug only", async () => {
    const { client, warn, debug } = await build();

    expect(
      await client.getCreateProtocolVersions({
        documentType: "powerhouse/not-registered",
      }),
    ).toEqual({ "base-reducer": 2 });
    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining("not registered"),
      "powerhouse/not-registered",
    );
    expect(warn).not.toHaveBeenCalled();
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

  it("refuses an explicit base-reducer 3, which it cannot run", async () => {
    const { client } = await build();
    await expect(
      client.createEmpty(DOCUMENT_MODEL, {
        protocolVersions: { "base-reducer": 3 },
      }),
    ).rejects.toThrow(
      `requires base-reducer 3, which this reactor cannot run for ${DOCUMENT_MODEL}`,
    );
  });
});

/** A host that loads models on demand, as Switchboard with dynamicModelLoading does. */
describe("create paths for a model the loader brings in after boot", () => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    for (const reactor of reactors.splice(0)) {
      reactor.kill();
    }
  });

  async function build(behind: DocumentModelModule | undefined) {
    const load = vi.fn((documentType: string) =>
      behind && documentType === DOCUMENT_MODEL
        ? Promise.resolve(behind)
        : Promise.reject(new Error(`no package for ${documentType}`)),
    );
    const logger = new ConsoleLogger(["test"]);
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    const built = await new ReactorClientBuilder()
      .withLogger(logger)
      .withReactorBuilder(
        new ReactorBuilder()
          .withLogger(logger)
          .withDocumentModelSources([driveDocumentModelModule as never])
          .withDocumentModelLoader({ load }),
      )
      .withSigner((await TestP256Signer.create()).asISigner())
      .buildModule();
    reactors.push(built.reactor);
    const registered = await built.client.getDocumentModelModules();
    expect(
      registered.results.map((module) => module.documentModel.global.id),
    ).not.toContain(DOCUMENT_MODEL);
    return { client: built.client, reactor: built.reactor, load };
  }

  function unversioned(documentType = DOCUMENT_MODEL): PHDocument {
    const document = documentModelDocumentModelModule.utils.createDocument();
    return {
      ...document,
      header: createPresignedHeader(undefined, documentType),
    } as PHDocument;
  }

  const tagged =
    documentModelDocumentModelModule as unknown as DocumentModelModule;

  it("answers the read query with 2 without loading", async () => {
    const { client, load } = await build(tagged);

    expect(
      await client.getCreateProtocolVersions({ documentType: DOCUMENT_MODEL }),
    ).toEqual({ "base-reducer": 2 });
    expect(load).not.toHaveBeenCalled();
  });

  it("creates a createReducer model at 3 on its first create", async () => {
    const { client, load } = await build(tagged);

    const created = await client.create(unversioned());
    expect(created.header.protocolVersions?.["base-reducer"]).toBe(3);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("adds a createReducer model to a drive at 3 on its first create", async () => {
    const { client } = await build(tagged);

    const drive = await client.drives.create({ global: { name: "Drive" } });
    const file = await client.drives.addFile(drive.header.id, unversioned());
    expect(file.header.protocolVersions?.["base-reducer"]).toBe(3);
  });

  it("creates a model whose reducer createReducer did not build at 2", async () => {
    const { client } = await build(untaggedDocumentModel());

    const created = await client.create(unversioned());
    expect(created.header.protocolVersions?.["base-reducer"]).toBe(2);
  });

  it("leaves a failed load to the CREATE gate without loading again", async () => {
    const { client, load } = await build(undefined);

    await expect(client.create(unversioned())).rejects.toThrow(
      `Failed to load document model for type: ${DOCUMENT_MODEL}`,
    );
    expect(load).toHaveBeenCalledTimes(1);
  });
});
