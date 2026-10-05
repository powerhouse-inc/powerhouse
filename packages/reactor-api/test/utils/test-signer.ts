import type { SignatureTrustPolicy } from "@powerhousedao/reactor";
import type { Action, ISigner } from "@powerhousedao/shared/document-model";
import { actionSignerIdentity } from "@powerhousedao/shared/document-model";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/node";

/** A signer over a fresh in-memory P-256 key that emits v2 tuples. */
export async function createTestSigner(
  address = "0xabc",
): Promise<RenownCryptoSigner> {
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  return new RenownCryptoSigner(crypto, "test", {
    address,
    networkId: "eip155",
    chainId: 1,
  });
}

/** `action` signed for the log it is written to. */
export async function signFor(
  signer: ISigner,
  action: Action,
  documentId: string,
  branch = "main",
): Promise<Action> {
  const signature = await signer.signAction(action, { documentId, branch });
  return {
    ...action,
    context: {
      ...action.context,
      signer: { ...actionSignerIdentity(signer), signatures: [signature] },
    },
  };
}

/** Admits `signer`'s key and no other, for a peer under `authEnforcement`. */
export function trustOnly(signer: ISigner): SignatureTrustPolicy {
  const key = actionSignerIdentity(signer).app.key;
  return {
    authorizeSigner: (_signer, candidate) => Promise.resolve(candidate === key),
  };
}
