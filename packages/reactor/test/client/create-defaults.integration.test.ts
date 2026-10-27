import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactorClient } from "../../src/client/reactor-client.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import { TestP256Signer } from "../utils/p256-signer.js";

const DOCUMENT_MODEL = "powerhouse/document-model";

/** A legacy document whose header names no protocol versions. */
function unversioned(): PHDocument {
  const document = withSignaturePolicy(
    documentModelDocumentModelModule.utils.createDocument(),
    "legacy",
  );
  delete document.header.protocolVersions;
  return document;
}

function baseReducer(document: PHDocument): number | undefined {
  return document.header.protocolVersions?.["base-reducer"];
}

function copyOf(
  drive: PHDocument,
  sourceIds: string[],
): { id: string } | undefined {
  return (
    drive.state as unknown as { global: { nodes: Array<{ id: string }> } }
  ).global.nodes.find((node) => !sourceIds.includes(node.id));
}

describe.each<{ flags: Partial<ReactorFeatureFlags>; expected: number }>([
  { flags: {}, expected: 3 },
  { flags: { undoV3: false }, expected: 2 },
])("creates through a reactor with $flags", ({ flags, expected }) => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    for (const reactor of reactors.splice(0)) {
      reactor.kill();
    }
  });

  async function build(): Promise<{
    client: ReactorClient;
    reactor: IReactor;
  }> {
    const signer = (await TestP256Signer.create()).asISigner();
    const built = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            driveDocumentModelModule as never,
            documentModelDocumentModelModule,
          ])
          .withExecutorConfig({ featureFlags: flags }),
      )
      .withSigner(signer)
      .buildModule();
    reactors.push(built.reactor);
    return { client: built.client, reactor: built.reactor };
  }

  it("takes the local preference for every default create", async () => {
    const { client } = await build();

    expect(
      await client.getCreateProtocolVersions({ documentType: DOCUMENT_MODEL }),
    ).toEqual({
      "base-reducer": expected,
    });

    const drive = await client.drives.create({ global: { name: "Drive" } });
    expect(baseReducer(drive)).toBe(expected);

    const empty = await client.createEmpty(DOCUMENT_MODEL);
    expect(baseReducer(empty)).toBe(expected);

    const child = await client.createEmpty(DOCUMENT_MODEL, {
      parentIdentifier: drive.header.id,
    });
    expect(baseReducer(child)).toBe(expected);
    expect(
      (
        await client.getCreateProtocolVersions({
          documentType: DOCUMENT_MODEL,
          parentIdentifier: drive.header.id,
        })
      )["base-reducer"],
    ).toBe(expected);
  });

  it("gives a header without versions the local preference", async () => {
    const { client, reactor } = await build();

    const created = await client.create(unversioned());
    expect(baseReducer(created)).toBe(expected);

    const drive = await client.drives.create({ global: { name: "Drive" } });
    const file = await client.drives.addFile(drive.header.id, unversioned());
    expect(baseReducer(await client.get(file.header.id))).toBe(expected);

    // The reactor core selects for a versionless header as a client does.
    const direct = unversioned();
    await client.waitForJob(await reactor.create(direct));
    expect(baseReducer(await client.get(direct.header.id))).toBe(expected);
  });

  it("lets an explicit version win", async () => {
    const { client } = await build();

    const document = await client.createEmpty(DOCUMENT_MODEL, {
      protocolVersions: { "base-reducer": 2 },
    });
    expect(baseReducer(document)).toBe(2);
  });

  it("keeps a copy's source version unless the copy overrides it", async () => {
    const { client } = await build();
    const drive = await client.drives.create({ global: { name: "Drive" } });
    const source = await client.drives.addFile(
      drive.header.id,
      documentModelDocumentModelModule.utils.createDocument(),
    );
    expect(baseReducer(source)).toBe(2);

    await client.drives.copyNode(drive.header.id, source.header.id, undefined);
    const kept = copyOf(await client.get(drive.header.id), [source.header.id])!;
    expect(baseReducer(await client.get(kept.id))).toBe(2);

    if (expected !== 3) return;
    await client.drives.copyNode(
      drive.header.id,
      source.header.id,
      undefined,
      undefined,
      { protocolVersions: { "base-reducer": 3 } },
    );
    const upgraded = copyOf(await client.get(drive.header.id), [
      source.header.id,
      kept.id,
    ])!;
    const copy = await client.get(upgraded.id);
    expect(copy.header.protocolVersions).toEqual({
      ...source.header.protocolVersions,
      "base-reducer": 3,
    });
  });
});
