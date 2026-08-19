"use client";

import type { DocumentModelModule } from "document-model";
import { type ReactNode, useEffect, useState } from "react";
import { DocumentCache } from "../document-cache.js";
import { addPHEventHandlers } from "../hooks/add-ph-event-handlers.js";
import { setAttachmentService } from "../hooks/attachment-service.js";
import { setDocumentCache } from "../hooks/document-cache.js";
import { setReactorClient, useReactorClient } from "../hooks/reactor.js";
import { setVetraPackageManager } from "../hooks/vetra-packages.js";
import type { PHGlobal } from "../types/global.js";
import {
  packageFromDocumentModels,
  StaticPackageManager,
} from "./static-package-manager.js";
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

  /**
   * The document model modules the app works with, imported from its generated
   * package's `document-models` SUBPATH:
   *
   * ```tsx
   * import { TodoV1, TodoV2 } from "my-models/document-models";
   * <GraphQLReactorProvider url={url} documentModels={[TodoV1, TodoV2]}>
   * ```
   *
   * Wrapped via {@link packageFromDocumentModels} and published through a
   * {@link StaticPackageManager} into the same `window.ph.vetraPackageManager`
   * slot Connect fills, so `useDocumentModelModules` and
   * `useDocumentModelModuleById` work below this provider.
   *
   * Modules only, deliberately - not whole packages. Editors are not portable
   * outside Connect yet (they read the selected document from Connect's
   * drive/node selection) and would inflate the bundle; a light app that needs
   * an editor imports the React component directly.
   *
   * Import from the `document-models` subpath, never from the package ROOT:
   * the root entry also exports the package's `processorFactory`, and module
   * resolution happens before tree-shaking, so a root import drags processor
   * (server-side) code into the browser bundle and can break the build.
   *
   * They are also what lets the client SIGN a batch of two or more actions:
   * signing the second action needs the state the first one leaves behind, and
   * only the document's own reducer can predict it, so a batch is signable only
   * while the module matching the document's type and exact version is here.
   * Single actions are signed without any of this.
   *
   * Optional on purpose: a light app may equally ship NO modules and let the
   * Switchboard own the model entirely - both modes are supported.
   *
   * Like `url`, this is read once, when the client is built.
   */
  documentModels?: readonly DocumentModelModule<any>[];

  children: ReactNode;
};

/**
 * Mounts a {@link GraphQLReactorClient} into the `window.ph` slots the
 * reactor-browser hooks read, so `useDocument`, `useDispatch` and
 * `useReactorClient` work below it against a Switchboard, with no reactor in
 * the bundle.
 *
 * It fills the document slots, plus `window.ph.vetraPackageManager` when
 * `documentModels` is given (a fixed {@link StaticPackageManager}, which makes
 * the document-model hooks work). The same modules go to the client itself, so
 * a dispatch of two or more actions is signed rather than refused.
 * `window.ph.reactorClientModule` always stays empty, so full-reactor surfaces
 * (drives, jobs, editor auto-discovery) find nothing - an app below this
 * provider renders components it imports itself.
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
  documentModels,
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
          documentModels,
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

  // Its own effect for the same reason as the attachment service above: the
  // modules must not rebuild the client and its cache. The slot stays
  // populated on unmount, matching the other slots. setVetraPackageManager's
  // reactor side effects no-op here - there is no reactorClientModule to
  // register modules on.
  useEffect(() => {
    if (!documentModels || documentModels.length === 0) {
      return;
    }
    ensurePHEventHandlers();
    setVetraPackageManager(
      new StaticPackageManager([packageFromDocumentModels(documentModels)]),
    );
  }, [documentModels]);

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
