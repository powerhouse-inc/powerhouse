import { createPublicClient, http, type PublicClient } from 'viem';
import { getEnsAvatar, getEnsName } from 'viem/actions';
import {
    arbitrum,
    base,
    type Chain,
    goerli,
    mainnet,
    optimism,
    sepolia,
} from 'viem/chains';

const defaultChains = [mainnet, sepolia, goerli, arbitrum, base, optimism];

export function getChain(id: number): Chain | undefined {
    return defaultChains.find(chain => chain.id === id);
    // TODO: allow loading extra chains at build time
    // const chains = await import('viem/chains');
    // return Object.values(chains).find(
    //     x =>
    //         typeof x === 'object' &&
    //         x !== null &&
    //         'id' in x &&
    //         (x as Chain).id === id,
    // ) as Chain | undefined;
}

let client: PublicClient = createPublicClient({
    chain: mainnet,
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
