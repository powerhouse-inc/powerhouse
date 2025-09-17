import { wagmiConfig as defaultWagmiConfig } from "@powerhousedao/design-system";
import type { QueryClientProviderProps } from "@tanstack/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WagmiProviderProps } from "wagmi";
import { WagmiProvider } from "wagmi";

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
