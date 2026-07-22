import type { IRenown } from "@renown/sdk";
import { RenownBuilder } from "@renown/sdk";
import { useEffect, useRef } from "react";
import { loading } from "../hooks/loading.js";
import { addRenownEventHandler, setRenown } from "../hooks/renown.js";
import { login } from "./utils.js";

export interface RenownInitOptions {
  appName: string;
  /**
   * Prefix for localStorage keys, allowing multiple apps
   * to use Renown on the same domain without conflicts.
   */
  namespace?: string;
  url?: string;
  switchboardUrl?: string;
}

async function initRenown(
  appName: string,
  namespace: string | undefined,
  url: string | undefined,
  switchboardUrl: string | undefined,
): Promise<IRenown> {
  addRenownEventHandler();
  setRenown(loading);

  const builder = new RenownBuilder(appName, {
    basename: namespace,
    baseUrl: url,
    switchboardUrl,
  });
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

    initRenown(appName, namespace, url, switchboardUrl)
      .then(promiseRef.current!.resolve)
      .catch(promiseRef.current!.reject);
  }, []);

  return promiseRef.current.promise;
}
