import { PowerhouseVerifiableCredential } from './types';

export type { PowerhouseVerifiableCredential } from './types';

const RENOWN_URL = process.env.VITE_RENOWN_URL;

export async function getCredential(
    address: string,
    chainId: number,
    connectId: string,
): Promise<PowerhouseVerifiableCredential | undefined> {
    if (!RENOWN_URL) {
        throw new Error('RENOWN_URL is not set');
    }

    const response = await fetch(
        `${RENOWN_URL}/api/auth/credential?address=${encodeURIComponent(address)}&chainId=${encodeURIComponent(chainId)}&connectId=${encodeURIComponent(connectId)}`,
        {
            method: 'GET',
        },
    );
    if (response.ok) {
        const result = (await response.json()) as {
            credential: PowerhouseVerifiableCredential;
        };
        return result.credential;
    } else {
        throw new Error('Failed to get credential');
    }
}
