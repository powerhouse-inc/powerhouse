import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  hasDerivedDocumentId,
  isDerivedDocumentId,
  signaturePolicyOf,
  withSignaturePolicy,
  type PHDocumentHeader,
  type SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactorClient } from "../../src/client/reactor-client.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { TestP256Signer } from "../utils/p256-signer.js";

const DOCUMENT_MODEL = "powerhouse/document-model";

function expectV2Required(header: PHDocumentHeader): void {
  expect(signaturePolicyOf(header)).toBe("v2-required");
  expect(hasDerivedDocumentId(header)).toBe(true);
}

function expectLegacy(header: PHDocumentHeader): void {
  expect(signaturePolicyOf(header)).toBe("legacy");
  expect(isDerivedDocumentId(header.id)).toBe(false);
}

describe("ReactorClient creation policy", () => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    for (const reactor of reactors.splice(0)) {
      reactor.kill();
    }
  });

  async function clientCreating(
    policy?: SignaturePolicy,
  ): Promise<ReactorClient> {
    const builder = new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          driveDocumentModelModule as never,
          documentModelDocumentModelModule,
        ]),
      )
      .withSigner((await TestP256Signer.create()).asISigner());
    if (policy) {
      builder.withCreateSignaturePolicy(policy);
    }
    const built = await builder.buildModule();
    reactors.push(built.reactor);
    return built.client;
  }

  it("creates v2-required documents, drives, files and copies by default", async () => {
    const client = await clientCreating();
    expect(await client.getCreateSignaturePolicy()).toBe("v2-required");

    expectV2Required((await client.createEmpty(DOCUMENT_MODEL)).header);

    const drive = await client.drives.create({ global: { name: "Drive" } });
    expectV2Required(drive.header);

    const file = await client.drives.addFile(
      drive.header.id,
      documentModelDocumentModelModule.utils.createDocument(),
    );
    expectV2Required(file.header);

    const legacyFile = await client.drives.addFile(
      drive.header.id,
      withSignaturePolicy(
        documentModelDocumentModelModule.utils.createDocument(),
        "legacy",
      ),
    );
    expectLegacy(legacyFile.header);

    const copied = await client.drives.copyNode(
      drive.header.id,
      legacyFile.header.id,
      undefined,
    );
    const copy = copied.state.global.nodes.find(
      (node) => node.id !== legacyFile.header.id && node.id !== file.header.id,
    );
    expectV2Required((await client.get(copy!.id)).header);
  });

  it("creates legacy documents, drives and copies under a legacy default", async () => {
    const client = await clientCreating("legacy");
    expect(await client.getCreateSignaturePolicy()).toBe("legacy");

    expectLegacy((await client.createEmpty(DOCUMENT_MODEL)).header);

    const drive = await client.drives.create({ global: { name: "Drive" } });
    expectLegacy(drive.header);

    const legacyFile = await client.drives.addFile(
      drive.header.id,
      withSignaturePolicy(
        documentModelDocumentModelModule.utils.createDocument(),
        "legacy",
      ),
    );
    const copied = await client.drives.copyNode(
      drive.header.id,
      legacyFile.header.id,
      undefined,
    );
    const copy = copied.state.global.nodes.find(
      (node) => node.id !== legacyFile.header.id,
    );
    expectLegacy((await client.get(copy!.id)).header);
  });

  it("lets a call choose over the default, and keeps a handed-in header", async () => {
    const client = await clientCreating("legacy");

    expectV2Required(
      (
        await client.createEmpty(DOCUMENT_MODEL, {
          signaturePolicy: "v2-required",
        })
      ).header,
    );
    expectV2Required(
      (
        await client.drives.create({
          global: { name: "Asked" },
          signaturePolicy: "v2-required",
        })
      ).header,
    );

    const document = documentModelDocumentModelModule.utils.createDocument();
    const created = await client.create(document);
    expect(created.header.id).toBe(document.header.id);
    expectV2Required(created.header);

    const v2Default = await clientCreating();
    expectLegacy(
      (
        await v2Default.createEmpty(DOCUMENT_MODEL, {
          signaturePolicy: "legacy",
        })
      ).header,
    );
  });
});
