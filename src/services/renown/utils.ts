import { User } from './types';

export function parsePkhDid(
    did: string,
): Pick<User, 'networkId' | 'chainId' | 'address'> {
    const parts = did.split(':');
    if (!did.startsWith('did:pkh:') || parts.length !== 5) {
        throw new Error('Invalid pkh did');
    }

    return {
        networkId: did.split(':')[2],
        chainId: parseInt(did.split(':')[3]),
        address: did.split(':')[4],
    };
}
