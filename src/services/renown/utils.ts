import { User } from './types';

export function parsePkhDid(did: string): Pick<User, 'chainId' | 'address'> {
    const parts = did.split(':');
    if (!did.startsWith('did:pkh:') || parts.length !== 5) {
        throw new Error('Invalid pkh did');
    }
    const [, , , chainIdStr, address] = parts;

    if (!address.startsWith('0x')) {
        throw new Error(`Invalid address: ${address}`);
    }

    const chainId = Number(chainIdStr);
    if (isNaN(chainId)) {
        throw new Error(`Invalid chain id: ${chainIdStr}`);
    }

    return {
        chainId,
        address: address as `0x${string}`,
    };
}
