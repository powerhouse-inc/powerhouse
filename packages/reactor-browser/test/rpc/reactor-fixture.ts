import {
  ReactorBuilder,
  ReactorClientBuilder,
  type IReactorClient,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { createP256Signer } from "../utils/p256-signer.js";

export type InMemoryReactor = {
  client: IReactorClient;
  dispose: () => Promise<void>;
};

export async function createInMemoryReactorClient(): Promise<InMemoryReactor> {
  const module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([driveDocumentModelModule]),
    )
    .withSigner(await createP256Signer())
    .buildModule();
  return {
    client: module.client,
    dispose: async () => {
      await module.reactor.kill().completed;
    },
  };
}
