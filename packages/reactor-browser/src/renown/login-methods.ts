import { LoginMethod, type WalletAdapterDescriptor } from "@renown/sdk/wallet";
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

/** Derive the offered login methods from wallet adapter descriptors, for building a login UI. Reads each descriptor's eager metadata only — no wallet libraries load. Buttons follow the descriptor array order, deduped. Wire each to `useRenownAuth().login(undefined, id)`. Labels are overridable. See the reactor-browser README + Academy Renown auth guide. */
export function useRenownLoginMethods(
  adapters: WalletAdapterDescriptor[] | undefined,
  labels?: Partial<Record<LoginMethod, string>>,
): RenownLoginMethod[] {
  return useMemo(() => {
    if (!adapters) return [];
    const seen = new Set<LoginMethod>();
    const methods: RenownLoginMethod[] = [];
    for (const { meta } of adapters) {
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
  }, [adapters, labels]);
}
