"use client";

import { type ReactNode, useEffect, useState } from "react";
import { DocumentCache } from "../document-cache.js";
import { addPHEventHandlers } from "../hooks/add-ph-event-handlers.js";
import { setAttachmentService } from "../hooks/attachment-service.js";
import { setDocumentCache } from "../hooks/document-cache.js";
import { setReactorClient, useReactorClient } from "../hooks/reactor.js";
import type { PHGlobal } from "../types/global.js";
import {
  GraphQLReactorClient,
  isGraphQLReactorClient,
  type GraphQLReactorClientOptions,
} from "./graphql-reactor-client.js";

declare global {
  interface Window {
    /** Set by {@link ensurePHEventHandlers}; see its doc comment. */
    __phEventHandlersRegistered?: boolean;
  }
}

/**
 * Registers the `window.ph` event handlers once per page.
 *
 * The `set*` helpers only dispatch CustomEvents - nothing writes `window.ph`
 * until `addPHEventHandlers` has registered the listeners that do. Registration
 * is guarded by a marker on `window` rather than a module-level flag so that a
 * hot module replacement, or two copies of this module, still register once.
 */
export function ensurePHEventHandlers(): void {
  if (typeof window === "undefined" || window.__phEventHandlersRegistered) {
    return;
  }
  addPHEventHandlers();
  window.__phEventHandlersRegistered = true;
}

export type GraphQLReactorProviderProps = {
  /** The Switchboard GraphQL endpoint, e.g. `http://localhost:4001/graphql`. */
  url: string;

  /**
   * Resolves the bearer token sent with every request, per request. Defaults to
   * the token of the logged-in Renown user, or none when nobody is logged in.
   */
  tokenProvider?: GraphQLReactorClientOptions["tokenProvider"];

  /**
   * The Switchboard GraphQL subscriptions endpoint, e.g.
   * `ws://localhost:4001/graphql/subscriptions`. Defaults to the endpoint
   * derived from `url`.
   */
  subscriptionsUrl?: GraphQLReactorClientOptions["subscriptionsUrl"];

  /**
   * Whether server-pushed changes are delivered. On by default; set it to
   * `false` where there is no websocket to talk to.
   */
  realtime?: GraphQLReactorClientOptions["realtime"];

  /**
   * The attachment service the editors below this provider read attachments
   * through, published into the same `window.ph` slot Connect publishes it in.
   *
   * The app constructs it: attachments are a separate package, and which
   * storage an app talks to is the app's business. Leave it out and the slot
   * stays empty, exactly as it is without this provider.
   */
  attachmentService?: PHGlobal["attachmentService"];

  children: ReactNode;
};

/**
 * Mounts a {@link GraphQLReactorClient} into the `window.ph` slots the
 * reactor-browser hooks read, so `useDocument`, `useDispatch` and
 * `useReactorClient` work below it against a Switchboard, with no reactor in
 * the bundle.
 *
 * It fills the document slots only. `window.ph.vetraPackageManager` and
 * `window.ph.reactorClientModule` stay empty, so the package, document-model
 * and editor-module hooks find nothing - an app below this provider renders
 * components it imports itself.
 *
 * The client is built on the client only: on the server the slots stay empty
 * and the hooks report their normal loading states. The props are read once,
 * when the client is built - changing `url` afterwards does not rebuild it.
 *
 * The effect's cleanup disposes the cache and the client's socket, and the
 * effect rebuilds both if it runs again on the same client - which is what a
 * `StrictMode` mount does.
 */
export function GraphQLReactorProvider({
  url,
  tokenProvider,
  subscriptionsUrl,
  realtime,
  attachmentService,
  children,
}: GraphQLReactorProviderProps) {
  const [client] = useState(() =>
    typeof window === "undefined"
      ? undefined
      : new GraphQLReactorClient({
          url,
          tokenProvider,
          subscriptionsUrl,
          realtime,
        }),
  );

  useEffect(() => {
    if (!client) {
      return;
    }
    ensurePHEventHandlers();
    setReactorClient(client);
    const documentCache = new DocumentCache(client);
    setDocumentCache(documentCache);
    // Only the cache and the client's realtime socket are torn down. The window
    // slots are deliberately left populated, matching how Connect never unsets
    // them: consumers may read them while React is unmounting, and the next
    // mount overwrites them.
    return () => {
      documentCache.dispose();
      client.dispose();
    };
  }, [client]);

  // Published from an effect of its own so that a service the app builds
  // asynchronously still reaches the slot. Rebuilding the client and its cache
  // for it - which sharing the effect above would do - would throw away every
  // open document instead.
  useEffect(() => {
    if (!attachmentService) {
      return;
    }
    ensurePHEventHandlers();
    setAttachmentService(attachmentService);
  }, [attachmentService]);

  return <>{children}</>;
}

/**
 * Returns the {@link GraphQLReactorClient} mounted by
 * {@link GraphQLReactorProvider}, or `undefined` when the slot holds something
 * else - the full in-browser reactor client, or nothing yet.
 *
 * `useReactorClient` is typed as the narrow `IReactorBrowserClient` subset both
 * implementations share. This is how a component reaches the light client's own
 * surface, i.e. `subgraph` and `request`.
 *
 * The narrowing is by brand, not by `instanceof`: a page can carry two copies
 * of this module - a bundled package with its own copy, or a hot-replaced one -
 * and `instanceof` would then answer `false` for a perfectly good client and
 * leave the component silently without one.
 */
export function useSwitchboardClient(): GraphQLReactorClient | undefined {
  const client = useReactorClient();
  return isGraphQLReactorClient(client) ? client : undefined;
}
