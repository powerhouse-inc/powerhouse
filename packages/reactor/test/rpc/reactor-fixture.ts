import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { IReactorClient } from "../../src/client/types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import { TestP256Signer } from "../utils/p256-signer.js";

export type InMemoryReactor = {
  client: IReactorClient;
  dispose: () => Promise<void>;
};

export async function createInMemoryReactorClient(): Promise<InMemoryReactor> {
  const signer = await TestP256Signer.create();
  const module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([driveDocumentModelModule]),
    )
    .withSigner(signer.asISigner())
    .buildModule();
  return {
    client: module.client,
    dispose: async () => {
      await module.reactor.kill().completed;
    },
  };
}
