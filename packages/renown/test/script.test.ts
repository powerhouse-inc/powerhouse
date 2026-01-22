import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import {
  NodeKeyStorage,
  NodeRenownEventEmitter,
  Renown,
  RenownCrypto,
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
    const keyPath = `${import.meta.dirname}/tmp/.keypair.json`;
    const keyStorage = new NodeKeyStorage(keyPath);
    const connectCrypto = new RenownCrypto(keyStorage);
    const scriptDid = await connectCrypto.did();
    expect(scriptDid).toBe(
      "did:key:zDnaeW2bFev2wtLK4hzGQrXUh8BHWySfded1z72oR89btwipJ",
    );

    // Setup renown instance
    const renownStorage = new RenownMemoryStorage();
    const renown = new Renown(
      renownStorage,
      new NodeRenownEventEmitter(),
      { key: scriptDid, name: "script" },
      connectCrypto,
    );

    // // "did:pkh:networkId:chainId:address"
    const userDid = `did:pkh:eip155:1:0x9addcbbaa28f7eb5f75e023f7c1fcb13c9dfd8f7`;
    const user = await renown.login(userDid);
    console.info(JSON.stringify(user, null, 2));
    // Build reactor
    const reactorBuilder = new ReactorBuilder().withDocumentModels([
      documentModelDocumentModelModule,
    ]);
    const reactorClient = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .withSigner(renown.signer)
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
    const actionSigner = operation.action.context?.signer;
    console.info(JSON.stringify(actionSigner, null, 2));

    expect(actionSigner?.user).toStrictEqual({
      address: "0x9aDdcBbaA28F7eB5f75E023F7C1Fcb13C9DFD8F7",
      networkId: "eip155",
      chainId: 1,
    });

    expect(actionSigner?.app).toStrictEqual({
      key: scriptDid,
      name: "script",
    });

    expect(
      operation.action.context?.signer?.signatures
        .flat()
        .filter((sig) => sig.length > 0).length,
    ).toBeGreaterThan(0);
  });
});
