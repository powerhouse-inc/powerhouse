import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import { RenownBuilder } from "../src/init.node.js";
import {
  type DocumentModelDocument,
  documentModelDocumentModelModule,
  setName,
} from "document-model";
import { describe, expect, it } from "vitest";

describe("Renown on script", () => {
  it("should create a document and add a signed SET_NAME action", async () => {
    // "did:pkh:networkId:chainId
    const userDid = `did:pkh:eip155:1:0x9addcbbaa28f7eb5f75e023f7c1fcb13c9dfd8f7`;
    const scriptDid = `did:key:zDnaemYykA84zrhGcX2Tosec5nhabbxg652ARGkmjFJUfiy4J`;

    // Setup renown with RenownBuilder - much simpler!
    const keyPath = `${import.meta.dirname}/tmp/.keypair.json`;
    const renown = await new RenownBuilder("script", { keyPath }).build();

    expect(renown.signer.app?.key).toBe(scriptDid);

    await renown.login(userDid);

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

    expect(actionSigner?.app).toStrictEqual({
      key: "did:key:zDnaemYykA84zrhGcX2Tosec5nhabbxg652ARGkmjFJUfiy4J",
      name: "script",
    });

    expect(actionSigner?.user).toStrictEqual({
      address: "0x9aDdcBbaA28F7eB5f75E023F7C1Fcb13C9DFD8F7",
      networkId: "eip155",
      chainId: 1,
    });

    expect(
      operation.action.context?.signer?.signatures
        .flat()
        .filter((sig) => sig.length > 0).length,
    ).toBeGreaterThan(0);
  });
});
