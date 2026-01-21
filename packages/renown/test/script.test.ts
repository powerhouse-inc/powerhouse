import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import {
  ConnectCrypto,
  ConnectCryptoSigner,
  NodeKeyStorage,
  NodeRenownEventEmitter,
  Renown,
  RenownMemoryStorage,
} from "@renown/sdk/node";
import {
  type DocumentModelDocument,
  documentModelDocumentModelModule,
  setName,
} from "document-model";
import { describe, expect, it } from "vitest";

describe("Renown on script", () => {
  it("should create a document and add a signed SET_NAME action", async () => {
    // Setup signer
    const keyStorage = new NodeKeyStorage();

    const connectCrypto = new ConnectCrypto(keyStorage);

    const signer = new ConnectCryptoSigner(connectCrypto);
    const scriptDid = await connectCrypto.did();

    // Setup renown instance
    const renownStorage = new RenownMemoryStorage();
    const renown = new Renown(
      renownStorage,
      new NodeRenownEventEmitter(),
      scriptDid,
    );

    // // "did:pkh:networkId:chainId:address"
    const userDid = `did:pkh:eip155:1:${"0xF7013C03dcF50fb54e6219D849CC8eEB5567e478".toLowerCase()}`;
    const user = await renown.login(userDid);
    console.info(JSON.stringify(user, null, 2));

    // Build reactor
    const reactorBuilder = new ReactorBuilder().withDocumentModels([
      documentModelDocumentModelModule,
    ]);
    const reactorClient = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .withSigner(signer)
      .build();

    // Create new document
    const document = await reactorClient.createEmpty<DocumentModelDocument>(
      "powerhouse/document-model",
    );

    // Add SET_NAME action
    const result = await reactorClient.execute(document.header.id, "main", [
      setName("New name"),
    ]);

    // Get action signature
    const operation = result.operations.global[0];
    console.info(JSON.stringify(operation.action.context?.signer, null, 2));

    expect(
      operation.action.context?.signer?.signatures
        .flat()
        .filter((sig) => sig.length > 0).length,
    ).toBeGreaterThan(0);
  });
});
