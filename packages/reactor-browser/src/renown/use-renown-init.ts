import type { IRenown } from "@renown/sdk";
import { RenownBuilder } from "@renown/sdk";
import { useRef } from "react";
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
}

async function initRenown(
  appName: string,
  namespace: string | undefined,
  url: string | undefined,
): Promise<IRenown> {
  addRenownEventHandler();
  setRenown(loading);

  const builder = new RenownBuilder(appName, {
    basename: namespace,
    baseUrl: url,
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
}: RenownInitOptions): Promise<IRenown> {
  const promiseRef = useRef(Promise.withResolvers<IRenown>());
  const initRef = useRef(false);

  if (typeof window === "undefined") {
    promiseRef.current.reject(new Error("window is undefined"));
    return promiseRef.current.promise;
  }

  if (initRef.current) {
    return promiseRef.current.promise;
  }

  initRef.current = true;

  initRenown(appName, namespace, url)
    .then(promiseRef.current.resolve)
    .catch(promiseRef.current.reject);

  return promiseRef.current.promise;
}
