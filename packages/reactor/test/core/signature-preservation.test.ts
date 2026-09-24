import {
  actions,
  type Action,
  type ISigner,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IReactorClient } from "../../src/client/types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { TestP256Signer } from "../utils/p256-signer.js";

function spiedSigner(key: TestP256Signer): ISigner {
  const signer = key.asISigner();
  return { ...signer, signAction: vi.fn(signer.signAction) };
}

describe("Signature Preservation", () => {
  let signerA: ISigner;
  let signerB: ISigner;
  let keyB: TestP256Signer;
  let reactorClient: IReactorClient;
  let reactor: IReactor;

  beforeEach(async () => {
    signerA = spiedSigner(await TestP256Signer.create());
    keyB = await TestP256Signer.create();
    signerB = spiedSigner(keyB);

    expect(signerA.app!.key).not.toBe(signerB.app!.key);

    const reactorBuilder = new ReactorBuilder().withDocumentModelSources([
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

    const baseAction = actions.setName("Test Document");
    const signatureB = await keyB.v2Tuple(baseAction, {
      documentId: doc.header.id,
      branch: "main",
    });
    const preSignedAction: Action = keyB.signed(baseAction, signatureB);

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
