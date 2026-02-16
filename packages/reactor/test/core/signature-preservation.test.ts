import { actions, documentModelDocumentModelModule } from "document-model";
import type {
  Action,
  AppActionSigner,
  ISigner,
  Signature,
  UserActionSigner,
} from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactorClient } from "../../src/client/types.js";
import type { IReactor } from "../../src/core/types.js";

function createTestSigner(name: string, publicKey: string): ISigner {
  const app: AppActionSigner = { name, key: publicKey };
  const user: UserActionSigner = {
    address: "0x123",
    chainId: 1,
    networkId: "eip155",
  };

  return {
    app,
    user,
    publicKey: {} as CryptoKey,
    sign: vi.fn().mockResolvedValue(new Uint8Array(0)),
    verify: vi.fn().mockResolvedValue(undefined),
    signAction: vi.fn().mockImplementation((): Promise<Signature> => {
      return Promise.resolve<Signature>([
        String(Date.now() / 1000),
        publicKey,
        "action-hash",
        "prev-state-hash",
        "0xsignature",
      ]);
    }),
  };
}

describe("Signature Preservation", () => {
  let signerA: ISigner;
  let signerB: ISigner;
  let reactorClient: IReactorClient;
  let reactor: IReactor;

  beforeEach(async () => {
    signerA = createTestSigner("signerA", "did:key:zA");
    signerB = createTestSigner("signerB", "did:key:zB");

    expect(signerA.app!.key).not.toBe(signerB.app!.key);

    const reactorBuilder = new ReactorBuilder().withDocumentModels([
      documentModelDocumentModelModule,
    ]);
    reactorClient = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .withSigner(signerA)
      .build();

    reactor = (reactorClient as any).reactor as IReactor;
  });

  afterEach(() => {
    reactor.kill();
  });

  it("should NOT overwrite pre-signed actions", async () => {
    const doc = await reactorClient.createEmpty("powerhouse/document-model");

    const signatureB: Signature = [
      String(Date.now() / 1000),
      signerB.app!.key,
      "action-hash-b",
      "prev-state-hash-b",
      "0xsignatureB",
    ];

    const baseAction = actions.setName("Test Document");
    const preSignedAction: Action = {
      ...baseAction,
      context: {
        signer: {
          user: signerB.user ?? { address: "", chainId: 0, networkId: "" },
          app: signerB.app!,
          signatures: [signatureB],
        },
      },
    };

    const callsBeforeExecute = (signerA.signAction as ReturnType<typeof vi.fn>)
      .mock.calls.length;

    await reactorClient.execute(doc.header.id, "main", [preSignedAction]);

    const callsAfterExecute = (signerA.signAction as ReturnType<typeof vi.fn>)
      .mock.calls.length;

    expect(callsAfterExecute).toBe(callsBeforeExecute);

    const operations = await reactor.getOperations(doc.header.id);
    const globalOps = operations.global.results;
    const lastOp = globalOps[globalOps.length - 1];

    const opSigner = lastOp.action.context?.signer;
    expect(opSigner).toBeDefined();
    expect(opSigner?.app.key).toBe(signerB.app!.key);
    expect(opSigner?.app.key).not.toBe(signerA.app!.key);
    expect(opSigner?.signatures).toHaveLength(1);
    expect(opSigner?.signatures[0]).toEqual(signatureB);
  });

  it("should sign unsigned actions with ReactorClient signer", async () => {
    const doc = await reactorClient.createEmpty("powerhouse/document-model");

    const callsBeforeExecute = (signerA.signAction as ReturnType<typeof vi.fn>)
      .mock.calls.length;

    const action = actions.setName("Test Document");

    await reactorClient.execute(doc.header.id, "main", [action]);

    const callsAfterExecute = (signerA.signAction as ReturnType<typeof vi.fn>)
      .mock.calls.length;

    expect(callsAfterExecute).toBe(callsBeforeExecute + 1);

    const operations = await reactor.getOperations(doc.header.id);
    const globalOps = operations.global.results;
    const lastOp = globalOps[globalOps.length - 1];

    const opSigner = lastOp.action.context?.signer;
    expect(opSigner).toBeDefined();
    expect(opSigner?.app.key).toBe(signerA.app!.key);
    expect(opSigner?.signatures).toHaveLength(1);
  });
});
