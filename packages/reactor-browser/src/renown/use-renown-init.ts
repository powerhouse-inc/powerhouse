import type { IRenown } from "@renown/sdk";
import { RenownBuilder } from "@renown/sdk";
import { useEffect, useRef } from "react";
import { loading } from "../hooks/loading.js";
import { addRenownEventHandler, setRenown } from "../hooks/renown.js";
import { login } from "./session.js";

export interface RenownInitOptions {
  appName: string;
  /** Prefix for localStorage keys, so multiple apps can share a domain. */
  namespace?: string;
  url?: string;
  switchboardUrl?: string;
  /** Re-check the restored credential against the source (default "always"). */
  revalidate?: "always" | "never";
  /** Chain id credentials are issued on (default 1). It is part of the user's DID, so sign-in from a wallet on another chain is rejected. */
  chainId?: number;
}

async function initRenown(
  appName: string,
  namespace: string | undefined,
  url: string | undefined,
  switchboardUrl: string | undefined,
  revalidate: "always" | "never",
  chainId: number | undefined,
): Promise<IRenown> {
  addRenownEventHandler();
  setRenown(loading);

  const builder = new RenownBuilder(appName, {
    basename: namespace,
    baseUrl: url,
    switchboardUrl,
    revalidate,
    chainId,
  });
  // Browser build() fires a non-blocking credential revalidate (when enabled)
  // plus a profile refresh; init stays optimistic either way.
  const renown = await builder.build();
  setRenown(renown);

  await login(undefined, renown);

  return renown;
}

/**
 * Hook that initializes the Renown SDK.
 * Call once at the top of your app. Options are read only on first mount.
 * Returns a promise that resolves with the Renown instance.
 *
 * @example
 * ```tsx
 * function App() {
 *   const renownPromise = useRenownInit({ appName: "my-app" });
 *   return <MyApp />;
 * }
 * ```
 */
export function useRenownInit({
  appName,
  namespace,
  url,
  switchboardUrl,
  revalidate = "always",
  chainId,
}: RenownInitOptions): Promise<IRenown> {
  // Stable promise returned every render; resolved later by the init effect.
  const promiseRef = useRef<PromiseWithResolvers<IRenown> | null>(null);
  promiseRef.current ??= Promise.withResolvers<IRenown>();

  const initRef = useRef(false);

  // Init must run in an effect, not during render: setRenown() mutates the
  // useSyncExternalStore-backed store, which would update subscribers mid-render.
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    initRenown(appName, namespace, url, switchboardUrl, revalidate, chainId)
      .then(promiseRef.current!.resolve)
      .catch(promiseRef.current!.reject);
  }, []);

  return promiseRef.current.promise;
}
