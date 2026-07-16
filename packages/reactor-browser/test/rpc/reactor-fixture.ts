import {
  ReactorBuilder,
  ReactorClientBuilder,
  type IReactorClient,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";

export type InMemoryReactor = {
  client: IReactorClient;
  dispose: () => Promise<void>;
};

export async function createInMemoryReactorClient(): Promise<InMemoryReactor> {
  const module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([driveDocumentModelModule]),
    )
    .buildModule();
  return {
    client: module.client,
    dispose: async () => {
      await module.reactor.kill().completed;
    },
  };
}
