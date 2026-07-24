import {
  DEFAULT_MOCK_METHODS,
  DEFAULT_PRIVY_METHODS,
  LoginMethod,
  type WalletAdaptersConfig,
} from "@renown/sdk/wallet";
import { useMemo } from "react";

export interface RenownLoginMethod {
  id: LoginMethod;
  label: string;
}

const DEFAULT_METHOD_LABELS: Partial<Record<LoginMethod, string>> = {
  [LoginMethod.WALLET]: "Connect a Wallet",
  [LoginMethod.GOOGLE]: "Continue with Google",
  [LoginMethod.EMAIL]: "Continue with Email",
  [LoginMethod.APPLE]: "Continue with Apple",
};

/** Derive the offered login methods (wallet + Privy's methods) from an adapters config, for building a login UI. Reads config only — no wallet libraries load. Wire each to `useRenownAuth().login(undefined, id)`. Labels are overridable. See the reactor-browser README + Academy Renown auth guide. */
export function useRenownLoginMethods(
  adapters: WalletAdaptersConfig | undefined,
  labels?: Partial<Record<LoginMethod, string>>,
): RenownLoginMethod[] {
  return useMemo(() => {
    if (!adapters) return [];
    const label = (id: LoginMethod) =>
      labels?.[id] ?? DEFAULT_METHOD_LABELS[id] ?? id;
    const seen = new Set<LoginMethod>();
    const methods: RenownLoginMethod[] = [];
    const add = (id: LoginMethod) => {
      if (seen.has(id)) return;
      seen.add(id);
      methods.push({ id, label: label(id) });
    };
    if (adapters.rainbow) add(LoginMethod.WALLET);
    if (adapters.privy) {
      const privyMethods = adapters.privy.methods?.length
        ? (adapters.privy.methods as LoginMethod[])
        : DEFAULT_PRIVY_METHODS;
      privyMethods.forEach(add);
    }
    if (adapters.mock) {
      const mockMethods = adapters.mock.methods?.length
        ? (adapters.mock.methods as LoginMethod[])
        : DEFAULT_MOCK_METHODS;
      mockMethods.forEach(add);
    }
    return methods;
  }, [adapters, labels]);
}
