import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  protocolVersionsFor,
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

/** Under the default registry every create path keeps its pre-feature versions. */
describe.each<SignaturePolicy>(["v2-required", "legacy"])(
  "create paths under the default registry (%s)",
  (policy) => {
    const reactors: IReactor[] = [];
    const before = protocolVersionsFor(policy);

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

    it("selects the pre-feature versions everywhere", async () => {
      const reactor = await client();

      expect(await reactor.getCreateProtocolVersions()).toEqual({
        "base-reducer": 2,
      });

      const drive = await reactor.drives.create({ global: { name: "Drive" } });
      expect(drive.header.protocolVersions).toEqual(before);

      const empty = await reactor.createEmpty(DOCUMENT_MODEL);
      expect(empty.header.protocolVersions).toEqual(before);

      const child = await reactor.createEmpty(DOCUMENT_MODEL, {
        parentIdentifier: drive.header.id,
      });
      expect(child.header.protocolVersions).toEqual(before);

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
