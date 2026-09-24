import type {
  ActionSigner,
  ISigner,
} from "@powerhousedao/shared/document-model";
import { actionSignerIdentity } from "@powerhousedao/shared/document-model";
import type { SignatureTrustPolicy } from "./types.js";

/**
 * The policy admission asks: the reactor's own key signing as its own user is
 * accepted, then the host's policy decides, else the default does. `own` is
 * read on every ask, since its user changes on login.
 */
export function admissionTrustPolicy(
  own: ISigner,
  authEnforcement: boolean,
  policy?: SignatureTrustPolicy,
): SignatureTrustPolicy {
  return {
    authorizeSigner(signer, key, documentId) {
      const identity = actionSignerIdentity(own);
      if (identity.app.key !== "" && key === identity.app.key) {
        if (sameUser(actionSignerIdentity(signer).user, identity.user)) {
          return Promise.resolve(true);
        }
      }
      if (policy) {
        return policy.authorizeSigner(signer, key, documentId);
      }
      return Promise.resolve(!authEnforcement);
    },
  };
}

function sameUser(a: ActionSigner["user"], b: ActionSigner["user"]): boolean {
  return (
    a.address.toLowerCase() === b.address.toLowerCase() &&
    a.networkId === b.networkId &&
    a.chainId === b.chainId
  );
}
