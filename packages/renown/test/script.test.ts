import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import {
  MemoryKeyStorage,
  RenownBuilder,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/node";
import {
  actions,
  type Action,
  type DocumentModelDocument,
  documentModelDocumentModelModule,
  setName,
  type UserActionSigner,
} from "document-model";
import { describe, expect, it } from "vitest";

// Note: RenownBuilder is used by the first test (requires network access)
// The new test uses RenownCryptoBuilder + RenownCryptoSigner directly (no network access)

describe("Renown on script", () => {
  it("should create a document and add a signed SET_NAME action", async () => {
    // "did:pkh:networkId:chainId
    const userDid = `did:pkh:eip155:1:0x9addcbbaa28f7eb5f75e023f7c1fcb13c9dfd8f7`;
    const scriptDid = `did:key:zDnaemYykA84zrhGcX2Tosec5nhabbxg652ARGkmjFJUfiy4J`;

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

  it("should NOT overwrite pre-signed actions with resulting-state-hash format", async () => {
    // Create a test user that both signers will share
    const testUser: UserActionSigner = {
      address: "0x9aDdcBbaA28F7eB5f75E023F7C1Fcb13C9DFD8F7",
      networkId: "eip155",
      chainId: 1,
    };

    // Create two Renown signers with different keys (no network access needed)
    const keyStorageA = new MemoryKeyStorage();
    const cryptoA = await new RenownCryptoBuilder()
      .withKeyPairStorage(keyStorageA)
      .build();
    const signerA = new RenownCryptoSigner(cryptoA, "scriptA", testUser);

    const keyStorageB = new MemoryKeyStorage();
    const cryptoB = await new RenownCryptoBuilder()
      .withKeyPairStorage(keyStorageB)
      .build();
    const signerB = new RenownCryptoSigner(cryptoB, "scriptB", testUser);

    // Verify different app DIDs (different keypairs = different DIDs)
    expect(signerA.app.key).not.toBe(signerB.app.key);

    // Build ReactorClient with signerB
    const reactorBuilder = new ReactorBuilder().withDocumentModels([
      documentModelDocumentModelModule,
    ]);
    const reactorClient = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .withSigner(signerB)
      .build();

    // Create a document
    const doc = await reactorClient.createEmpty<DocumentModelDocument>(
      "powerhouse/document-model",
    );

    // Step 1: Execute a FIRST action normally to establish a real prevOpHash
    // This creates operation 0 with a real resulting state hash
    await reactorClient.execute(doc.header.id, "main", [setName("First Name")]);

    // Get the latest operation from the store
    const operations = await reactorClient.getOperations(doc.header.id, {
      scopes: ["global"],
    });
    const latestOp = operations.results[operations.results.length - 1];
    // operation.hash IS the state hash (hash of document.state after this operation)
    const prevOpHash = latestOp.hash;

    // Step 2: For the SECOND action, pre-sign it with signerA
    // Now we have a real prevOpHash to use in the signature
    const secondAction = actions.setName("Second Name");

    // For resultingStateHash, we predict what the state will be after this action.
    // In a real script, you'd run the reducer locally to compute this.
    // For this test, we use the prevOpHash as a stand-in (it's a real hash format).
    // The key is testing signature PRESERVATION, not hash validation.
    const predictedResultingHash = prevOpHash; // Use real hash format for testing

    // Create the action with prevOpHash in context (required for signature)
    const actionWithContext: Action = {
      ...secondAction,
      context: {
        ...secondAction.context,
        prevOpHash,
      },
    };

    const signatureA = await signerA.signActionWithResultingState(
      actionWithContext,
      predictedResultingHash,
    );

    // Verify signature has resulting-hash format: "prevOpHash:resultingHash"
    expect(signatureA[3]).toContain(":");
    expect(signatureA[3]).toBe(`${prevOpHash}:${predictedResultingHash}`);

    const preSignedAction: Action = {
      ...actionWithContext,
      context: {
        ...actionWithContext.context,
        signer: {
          user: signerA.user!,
          app: signerA.app,
          signatures: [signatureA],
        },
      },
    };

    // Verify the preSignedAction has the signature before executing
    expect(preSignedAction.context?.signer?.signatures).toHaveLength(1);
    expect(preSignedAction.context?.signer?.app.key).toBe(signerA.app.key);

    // Step 3: Execute the pre-signed action via ReactorClient (which uses signerB)
    await reactorClient.execute(doc.header.id, "main", [preSignedAction]);

    // Get the second operation from the store
    const allOperations = await reactorClient.getOperations(doc.header.id, {
      scopes: ["global"],
    });
    const secondOp = allOperations.results[1]; // Second SET_NAME operation
    const opSigner = secondOp.action.context?.signer;
    expect(opSigner).toBeDefined();

    // Signature should be from signerA, not signerB
    expect(opSigner?.app.key).toBe(signerA.app.key);
    expect(opSigner?.app.key).not.toBe(signerB.app.key);

    // Should have exactly one signature (the original from signerA)
    expect(opSigner?.signatures).toHaveLength(1);

    // Signature should be byte-for-byte identical to signatureA
    expect(opSigner?.signatures[0]).toEqual(signatureA);

    // Verify the resulting-hash format is preserved: "prevOpHash:predictedResultingHash"
    expect(opSigner?.signatures[0][3]).toContain(":");
    expect(opSigner?.signatures[0][3]).toBe(
      `${prevOpHash}:${predictedResultingHash}`,
    );
  });
});
