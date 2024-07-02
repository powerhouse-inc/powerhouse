import { wagmiConfig as defaultWagmiConfig } from '@/services';
import {
    QueryClient,
    QueryClientProvider,
    QueryClientProviderProps,
} from '@tanstack/react-query';
import { ReactNode } from 'react';
import { WagmiProvider, WagmiProviderProps } from 'wagmi';

const defaultQueryClient = new QueryClient();

type Props = {
    wagmiProviderProps?: WagmiProviderProps;
    queryClientProviderProps?: QueryClientProviderProps;
    children: ReactNode;
};
export function WagmiContext(props: Props) {
    const { children, wagmiProviderProps, queryClientProviderProps } = props;
    const { config = defaultWagmiConfig, ...wagmiProps } =
        wagmiProviderProps ?? {};
    const { client = defaultQueryClient, ...queryClientProps } =
        queryClientProviderProps ?? {};

    return (
        <WagmiProvider config={config} {...wagmiProps}>
            <QueryClientProvider client={client} {...queryClientProps}>
                {children}
            </QueryClientProvider>
        </WagmiProvider>
    );
}
