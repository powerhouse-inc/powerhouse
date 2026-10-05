import type { Action } from "@powerhousedao/shared/document-model";
import { actionSigningTarget } from "@powerhousedao/shared/document-model";
import type { SignatureTrustPolicy } from "../../src/signer/types.js";
import { TestP256Signer } from "./p256-signer.js";

/** Lets any key sign as any address, for tests that decide on the address. */
export const TRUST_ANY_SIGNER: SignatureTrustPolicy = {
  authorizeSigner: () => Promise.resolve(true),
};

let key: Promise<TestP256Signer> | undefined;

/** `action` with a v2 signature for `documentId`, claiming `address`. */
export async function signedAs<T extends Action>(
  action: T,
  address: string,
  documentId: string,
  branch = "main",
): Promise<T> {
  key ??= TestP256Signer.create();
  const signer = await key;
  const user = { address, networkId: "", chainId: 0 };
  const tuple = await signer.v2Tuple(
    action,
    actionSigningTarget(action, documentId, branch),
    user,
  );
  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        user,
        app: { name: "test", key: signer.did },
        signatures: [tuple],
      },
    },
  };
}
