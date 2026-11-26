import type { SignatureTrustPolicy } from "@powerhousedao/reactor";
import type { ISigner } from "@powerhousedao/shared/document-model";
import { actionSignerIdentity } from "@powerhousedao/shared/document-model";

/** Admits `signer`'s key and no other, for a peer under `authEnforcement`. */
export function trustOnly(signer: ISigner): SignatureTrustPolicy {
  const key = actionSignerIdentity(signer).app.key;
  return {
    authorizeSigner: (_signer, candidate) => Promise.resolve(candidate === key),
  };
}
