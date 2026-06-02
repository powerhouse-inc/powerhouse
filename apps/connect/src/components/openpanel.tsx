import type { OpenPanel as OpenPanelClient } from "@openpanel/web";
import { connectConfig } from "@powerhousedao/connect/config";
import { useAcceptedCookies } from "@powerhousedao/connect/hooks";
import {
  createOpenPanelProcessorFactory,
  eventLookupMap,
  eventMappings,
  getOpenPanelClient,
  resetOpenPanelClient,
} from "@powerhousedao/connect/services";
import {
  useReactorClientModule,
  useUser,
} from "@powerhousedao/reactor-browser";
import { useEffect, useRef, useState } from "react";

import { buildTraits } from "./openpanel-traits.js";

declare global {
  interface Window {
    openPanel?: OpenPanelClient;
  }
}

/**
 * `OpenPanel` is a `null`-rendering component that manages the full lifecycle
 * of the OpenPanel analytics subsystem.
 *
 * Gates:
 * - `useAcceptedCookies().analytics === true` — the existing analytics cookie.
 * - `connectConfig.openPanel.clientId` non-empty — no client ID → no-op.
 *
 * Behaviour when both gates pass:
 * 1. Lazy-imports `@openpanel/web` and builds the singleton via
 *    `getOpenPanelClient(connectConfig.openPanel)`.
 * 2. Exposes the client on `window.openPanel` for the card-6 `useOpenPanel()`
 *    hook to consume.
 * 3. If `connectConfig.openPanel.trackOperations`, registers the processor
 *    factory against `processorManager` so document operations are forwarded.
 * 4. Calls `client.identify()` when the renown user transitions from
 *    `undefined` → defined (login). The profile ID is the wallet address —
 *    the cross-app key shared with Renown and Vetra.
 * 5. Calls `client.clear()` when the user transitions from defined →
 *    `undefined` (logout).
 *
 * Teardown (unmount **or** consent revocation):
 * - `unregisterFactory("openpanel")` to remove the processor.
 * - `resetOpenPanelClient()` to clear the singleton.
 * - `window.openPanel` is cleared.
 *
 * Mirrors the Sentry pattern in `store/user.ts` for login/logout detection.
 * Analytics failures are caught and forwarded to `console.warn` — they must
 * never throw into the application.
 *
 * Mounted next to `<Analytics />` in `app.tsx`.
 */
export function OpenPanel(): null {
  const [{ analytics }] = useAcceptedCookies();
  const user = useUser();
  const reactorClientModule = useReactorClientModule();

  const [client, setClient] = useState<OpenPanelClient | undefined>();

  /**
   * Tracks the previous `user` value so we can detect the two transitions:
   *   undefined → defined  (login)
   *   defined   → undefined (logout)
   */
  const prevUserRef = useRef<ReturnType<typeof useUser>>(undefined);

  const enabled = analytics && !!connectConfig.openPanel.clientId;
  const processorManager = reactorClientModule?.reactorModule?.processorManager;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    void (async () => {
      let builtClient: OpenPanelClient | undefined;
      try {
        builtClient = await getOpenPanelClient(connectConfig.openPanel);
      } catch (err) {
        console.warn("[OpenPanel] Failed to build client:", err);
        return;
      }

      if (cancelled || !builtClient) return;

      setClient(builtClient);
      window.openPanel = builtClient;

      if (connectConfig.openPanel.trackOperations && processorManager) {
        try {
          await processorManager.registerFactory(
            "openpanel",
            createOpenPanelProcessorFactory({
              client: builtClient,
              events: { mappings: eventMappings, lookupMap: eventLookupMap },
              startFrom: "current",
            }),
          );
          // Guard against teardown happening while registerFactory was in flight.
          if (cancelled) {
            await processorManager
              .unregisterFactory("openpanel")
              .catch((err: unknown) =>
                console.warn(
                  "[OpenPanel] Failed to unregister factory after cancellation:",
                  err,
                ),
              );
          }
        } catch (err) {
          console.warn(
            "[OpenPanel] Failed to register processor factory:",
            err,
          );
        }
      }
    })();

    return () => {
      cancelled = true;

      // Reset the user-tracking ref so that when consent is re-granted (and a
      // new client is built) any currently-logged-in user is re-identified.
      prevUserRef.current = undefined;

      if (connectConfig.openPanel.trackOperations && processorManager) {
        void processorManager
          .unregisterFactory("openpanel")
          .catch((err: unknown) =>
            console.warn(
              "[OpenPanel] Failed to unregister processor factory:",
              err,
            ),
          );
      }

      resetOpenPanelClient();
      window.openPanel = undefined;
      setClient(undefined);
    };
  }, [enabled, processorManager]);

  // detect login/logout transitions
  useEffect(() => {
    if (!enabled || !client) return;

    const prev = prevUserRef.current;
    prevUserRef.current = user;

    if (!prev && user) {
      // Login: undefined → defined (or client became available with user
      // already logged in — prevUserRef is undefined in both cases).
      try {
        void client.identify({
          // The wallet address is the cross-app profile key — the same
          // identifier Renown and Vetra use in their identify calls, so the
          // apps stitch into one OpenPanel profile. The DID travels as a
          // trait (see buildTraits).
          profileId: user.address,
          properties: buildTraits(user),
        });
      } catch (err) {
        console.warn("[OpenPanel] Failed to identify user:", err);
      }
    } else if (prev && !user) {
      // Logout: defined → undefined
      try {
        void client.clear();
      } catch (err) {
        console.warn("[OpenPanel] Failed to clear user:", err);
      }
    }
  }, [client, user, enabled]);

  return null;
}
