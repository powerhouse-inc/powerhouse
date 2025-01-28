import { createPublicClient, http, PublicClient } from 'viem';
import { getEnsAvatar, getEnsName } from 'viem/actions';
import * as chains from 'viem/chains';

export type Chain = chains.Chain;

export function getChain(id: number): Chain | undefined {
    return Object.values(chains).find(x => x.id === id);
}

let client: PublicClient = createPublicClient({
    chain: chains.mainnet,
    batch: {
        multicall: true,
    },
    transport: http(),
});

function updateChain(chainId: number) {
    if (client.chain?.id === chainId) {
        return;
    }

    const chain = getChain(chainId);
    if (!chain) {
        throw new Error(`Invalid chain id: ${chainId}`);
    }

    client = createPublicClient({
        chain,
        batch: {
            multicall: true,
        },
        transport: http(),
    });
}

export type ENSInfo = {
    name?: string;
    avatarUrl?: string;
};

export const getEnsInfo = async (
    address: `0x${string}`,
    chainId: number,
): Promise<ENSInfo> => {
    const result: ENSInfo = {};
    try {
        updateChain(chainId);
        const name = await getEnsName(client, { address });
        if (name) {
            result.name = name;

            const avatarUrl = await getEnsAvatar(client, { name });
            if (avatarUrl) {
                result.avatarUrl = avatarUrl;
            }
        }
    } catch (e) {
        console.error(e);
    }
    return result;
};
