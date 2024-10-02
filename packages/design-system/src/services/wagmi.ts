import { createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';

export const wagmiConfig: ReturnType<typeof createConfig> = createConfig({
    chains: [mainnet],
    transports: {
        [mainnet.id]: http(),
    },
});
