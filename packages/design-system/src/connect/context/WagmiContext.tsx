import { wagmiConfig as defaultWagmiConfig } from "#services";
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientProviderProps,
} from "@tanstack/react-query";
import { type ReactNode } from "react";
import { WagmiProvider, type WagmiProviderProps } from "wagmi";

const defaultQueryClient = new QueryClient();

type Props = {
  readonly wagmiProviderProps?: WagmiProviderProps;
  readonly queryClientProviderProps?: QueryClientProviderProps;
  readonly children: ReactNode;
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
