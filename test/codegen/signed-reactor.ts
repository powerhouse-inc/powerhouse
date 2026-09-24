import type {
  InProcessReactorModule,
  ReactorClient,
} from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/crypto";

/** An in-process reactor whose client signs every write with a fresh key. */
export async function buildSignedReactor(
  documentModels: DocumentModelModule[],
): Promise<{ client: ReactorClient; reactorModule: InProcessReactorModule }> {
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  const module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources(documentModels),
    )
    .withSigner(new RenownCryptoSigner(crypto, "codegen-test"))
    .buildModule();
  if (!module.reactorModule) {
    throw new Error("expected an in-process reactor module");
  }
  return { client: module.client, reactorModule: module.reactorModule };
}
