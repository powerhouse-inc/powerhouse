import { createPublicClient, http } from 'viem';
import { getEnsAvatar, getEnsName } from 'viem/actions';
import { sepolia } from 'viem/chains';

const client = createPublicClient({
    chain: sepolia, // TODO allow setting the chain
    batch: {
        multicall: true,
    },
    transport: http(),
});

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
