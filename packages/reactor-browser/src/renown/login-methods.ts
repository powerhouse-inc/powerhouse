import { LoginMethod } from "@renown/sdk/wallet";
import { useMemo, useSyncExternalStore } from "react";
import {
  getServerWalletDescriptors,
  getWalletDescriptors,
  subscribeWalletDescriptors,
} from "./wallet-registry.js";

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

/** The login methods the mounted {@link RenownWalletProvider}'s adapters offer, for building a login UI. Reads each descriptor's eager metadata only — no wallet libraries load. Buttons follow the provider's descriptor array order, deduped; empty when no provider is mounted (redirect-only). Wire each to `useRenownAuth().login(undefined, id)`. Labels are overridable. See the reactor-browser README + Academy Renown auth guide. */
export function useRenownLoginMethods(
  labels?: Partial<Record<LoginMethod, string>>,
): RenownLoginMethod[] {
  const descriptors = useSyncExternalStore(
    subscribeWalletDescriptors,
    getWalletDescriptors,
    getServerWalletDescriptors,
  );
  return useMemo(() => {
    const seen = new Set<LoginMethod>();
    const methods: RenownLoginMethod[] = [];
    for (const { meta } of descriptors) {
      for (const id of meta.supportedMethods) {
        if (seen.has(id)) continue;
        seen.add(id);
        methods.push({
          id,
          label: labels?.[id] ?? DEFAULT_METHOD_LABELS[id] ?? id,
        });
      }
    }
    return methods;
  }, [descriptors, labels]);
}
