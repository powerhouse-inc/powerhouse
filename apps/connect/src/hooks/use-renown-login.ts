import type { RenownLoginOption } from "@powerhousedao/design-system/connect";
import {
  openRenown,
  showPHModal,
  useRenownAuth,
  useRenownLoginMethods,
} from "@powerhousedao/reactor-browser";
import type { WalletAdaptersConfig } from "@renown/sdk/wallet";
import { useCallback, useMemo } from "react";
import { getRuntimeConfig } from "../runtime-config.js";

// Opens the in-page login modal when wallet adapters are configured; otherwise
// redirects straight to the Renown portal (no modal with only a redirect button).
export function useOpenRenownLogin(): () => void {
  const adapters = getRuntimeConfig().connect.renown?.adapters as
    | WalletAdaptersConfig
    | undefined;
  const methods = useRenownLoginMethods(adapters);
  return useCallback(() => {
    if (methods.length > 0) {
      showPHModal({ type: "login" });
    } else {
      openRenown();
    }
  }, [methods]);
}

export interface RenownLoginProps {
  onLogin: () => void;
  // One option per configured login method (wallet, Google, email, …). Empty
  // only when no adapters are configured (the redirect Connect button is used).
  methods: RenownLoginOption[];
  loading: boolean;
  error: string | null;
}

const LAST_METHOD_KEY = "renown:last-login-method";

function getLastLoginMethod(): string | null {
  try {
    return localStorage.getItem(LAST_METHOD_KEY);
  } catch {
    return null;
  }
}

function setLastLoginMethod(method: string): void {
  try {
    localStorage.setItem(LAST_METHOD_KEY, method);
  } catch {
    // localStorage unavailable (private mode / SSR) — the badge is optional.
  }
}

// Single source of the login wiring shared by every Connect CTA: in-page
// sign-in (with redirect fallback) plus pending/error feedback.
export function useRenownLoginProps(): RenownLoginProps {
  const { login, pending, error } = useRenownAuth();
  const onLogin = useCallback(() => login(), [login]);

  const adapters = getRuntimeConfig().connect.renown?.adapters as
    | WalletAdaptersConfig
    | undefined;
  // Method list (labels) comes from the shared primitive; Connect adds the
  // last-used badge + the onSelect wiring for its design-system card.
  const baseMethods = useRenownLoginMethods(adapters);

  const methods = useMemo<RenownLoginOption[]>(() => {
    const lastUsed = getLastLoginMethod();
    return baseMethods.map((method) => ({
      id: method.id,
      label: method.label,
      lastUsed: lastUsed === method.id,
      onSelect: () => {
        setLastLoginMethod(method.id);
        login(undefined, method.id);
      },
    }));
  }, [baseMethods, login]);

  return { onLogin, methods, loading: pending, error: error?.message ?? null };
}
