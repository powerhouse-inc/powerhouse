export type PKHDid = {
    networkId: string;
    chainId: number;
    address: `0x${string}`;
};

export function parsePkhDid(did: string): PKHDid {
    const parts = did.split(':');
    if (!did.startsWith('did:pkh:') || parts.length !== 5) {
        throw new Error('Invalid pkh did');
    }
    const [, , networkId, chainIdStr, address] = parts;

    if (!address.startsWith('0x')) {
        throw new Error(`Invalid address: ${address}`);
    }

    const chainId = Number(chainIdStr);
    if (isNaN(chainId)) {
        throw new Error(`Invalid chain id: ${chainIdStr}`);
    }

    return {
        chainId,
        networkId,
        address: address as PKHDid['address'],
    };
}
