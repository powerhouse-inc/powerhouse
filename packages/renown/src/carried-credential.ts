import { CREDENTIAL_TYPES } from "./constants.js";
import type { PowerhouseVerifiableCredential } from "./types.js";

/**
 * A bearer may carry the credential that names its session key, so a host can
 * check its signature without asking Renown. It rides as the JWT claim
 * `phCredential`, without `proof.eip712.types`: they are canonical, and
 * {@link expandCarriedCredential} puts them back.
 */
export const CARRIED_CREDENTIAL_CLAIM = "phCredential";

type CompactProof = Omit<PowerhouseVerifiableCredential["proof"], "eip712"> & {
  eip712?: { domain?: { version: string; chainId: number } };
};

export type CompactCredential = Omit<
  PowerhouseVerifiableCredential,
  "proof"
> & {
  proof: CompactProof;
};

/** Undefined for a credential without a proof: there is nothing to carry. */
export function compactCarriedCredential(
  credential: PowerhouseVerifiableCredential,
): CompactCredential | undefined {
  // Stored logins are read from disk, whatever the type says.
  const stored = credential.proof as
    | PowerhouseVerifiableCredential["proof"]
    | undefined;
  if (!stored) return undefined;
  const { eip712, ...proof } = stored;
  return {
    ...credential,
    proof: {
      ...proof,
      ...(eip712?.domain ? { eip712: { domain: eip712.domain } } : {}),
    },
  };
}

/** The carried credential, or undefined when there is none or it is malformed. */
export function expandCarriedCredential(
  value: unknown,
): PowerhouseVerifiableCredential | undefined {
  const compact = value as Partial<CompactCredential> | undefined;
  if (
    !compact ||
    typeof compact !== "object" ||
    typeof compact.id !== "string" ||
    typeof compact.issuer?.id !== "string" ||
    typeof compact.issuer.ethereumAddress !== "string" ||
    typeof compact.credentialSubject?.id !== "string" ||
    typeof compact.issuanceDate !== "string" ||
    typeof compact.expirationDate !== "string" ||
    typeof compact.proof?.proofValue !== "string"
  ) {
    return undefined;
  }
  const chainId = Number(compact.issuer.id.split(":")[3]);
  const domain = compact.proof.eip712?.domain ?? { version: "1", chainId };
  return {
    ...(compact as CompactCredential),
    proof: {
      ...compact.proof,
      eip712: {
        domain,
        types: CREDENTIAL_TYPES,
        primaryType: "VerifiableCredential",
      },
    },
  } as PowerhouseVerifiableCredential;
}

/** The credential a verified bearer's payload carries, if any. */
export function carriedCredentialOf(verified: {
  payload?: Record<string, unknown>;
}): PowerhouseVerifiableCredential | undefined {
  return expandCarriedCredential(verified.payload?.[CARRIED_CREDENTIAL_CLAIM]);
}
