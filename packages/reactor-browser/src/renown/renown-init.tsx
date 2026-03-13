import { type RenownInitOptions, useRenownInit } from "./use-renown-init.js";

export interface RenownProps extends RenownInitOptions {
  onError?: (error: unknown) => void;
}

/**
 * Side-effect component that initializes the Renown SDK.
 * Renders nothing — place it alongside your app tree.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <>
 *       <Renown appName="my-app" onError={console.error} />
 *       <MyApp />
 *     </>
 *   );
 * }
 * ```
 */
export function Renown({ onError, ...initOptions }: RenownProps) {
  useRenownInit(initOptions).catch(onError ?? console.error);
  return null;
}
