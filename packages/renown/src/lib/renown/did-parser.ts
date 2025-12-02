/**
 * DID parsing utilities for extracting information from DID strings
 */

export type PKHDid = {
  networkId: string;
  chainId: number;
  address: `0x${string}`;
};

/**
 * Parse a DID:pkh string to extract network, chain ID, and address information
 * @param did - The DID string in format "did:pkh:networkId:chainId:address"
 * @returns Parsed DID information
 * @throws Error if the DID format is invalid
 */
export function parsePkhDid(did: string): PKHDid {
  const parts = did.split(":");
  if (!did.startsWith("did:pkh:") || parts.length !== 5) {
    throw new Error("Invalid pkh did");
  }
  const [, , networkId, chainIdStr, address] = parts;

  if (!address.startsWith("0x")) {
    throw new Error(`Invalid address: ${address}`);
  }

  const chainId = Number(chainIdStr);
  if (isNaN(chainId)) {
    throw new Error(`Invalid chain id: ${chainIdStr}`);
  }

  return {
    chainId,
    networkId,
    address: address as PKHDid["address"],
  };
}

/**
 * Extract Ethereum address from a DID:pkh string
 * @param did - The DID string
 * @returns Ethereum address or null if invalid
 */
export function extractEthAddressFromDid(did: string): `0x${string}` | null {
  try {
    const parsed = parsePkhDid(did);
    return parsed.address;
  } catch {
    return null;
  }
}

/**
 * Extract chain ID from a DID:pkh string
 * @param did - The DID string
 * @returns Chain ID or null if invalid
 */
export function extractChainIdFromDid(did: string): number | null {
  try {
    const parsed = parsePkhDid(did);
    return parsed.chainId;
  } catch {
    return null;
  }
}
