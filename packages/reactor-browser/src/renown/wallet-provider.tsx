import { isWalletRedirectReturn, resolveAdapters } from "@renown/sdk/wallet";
import type {
  LoginMethod,
  WalletAdapter,
  WalletAdapterDescriptor,
  WalletAdapterMeta,
  WalletController,
  WalletSession,
  WalletTheme,
} from "@renown/sdk/wallet";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useUser } from "../hooks/renown.js";
import {
  failWalletActivation,
  setActiveWalletController,
  setWalletActivator,
  whenWalletControllerReady,
} from "./wallet-registry.js";
import { useCompleteRedirectSignIn } from "./use-complete-redirect-sign-in.js";

// A live controller paired with the meta that declares which methods it serves.
interface MountedAdapter {
  meta: WalletAdapterMeta;
  controller: WalletController;
}

// Merge per-adapter controllers into one. A requested method routes to the
// adapter whose meta declares it; a method-less connect uses the first adapter.
function mergeControllers(
  mounted: MountedAdapter[],
): WalletController | undefined {
  if (mounted.length === 0) return undefined;
  return {
    connect(method?: LoginMethod): Promise<WalletSession> {
      if (method) {
        const target = mounted.find((m) =>
          m.meta.supportedMethods.includes(method),
        );
        if (!target) {
          throw new Error(
            `No wallet adapter supports login method "${method}"`,
          );
        }
        return target.controller.connect(method);
      }
      const chosen = mounted.at(0);
      if (!chosen) throw new Error("No wallet adapter available");
      return chosen.controller.connect(method);
    },
    async disconnect(): Promise<void> {
      await Promise.all(mounted.map((m) => m.controller.disconnect()));
    },
    getSession(): WalletSession | undefined {
      for (const { controller } of mounted) {
        const session = controller.getSession();
        if (session) return session;
      }
      return undefined;
    },
  };
}

// Calls one adapter's controller hook inside its Provider and publishes it to
// the module-level registry; unregisters on unmount.
function AdapterControllerBridge(props: {
  adapter: WalletAdapter;
  onController: (
    meta: WalletAdapterMeta,
    controller: WalletController | undefined,
  ) => void;
  onSession: (id: string, session: WalletSession | undefined) => void;
}) {
  const { adapter, onController, onSession } = props;
  const { meta } = adapter;
  const controller = adapter.useController();
  useEffect(() => {
    onController(meta, controller);
    return () => onController(meta, undefined);
  }, [meta, controller, onController]);
  // Adapters that push session changes (Privy) let sign-in complete on an OAuth
  // return, where the connect() promise died with the pre-redirect page.
  useEffect(() => {
    if (!controller.subscribe) return;
    return controller.subscribe((session) => onSession(meta.id, session));
  }, [meta.id, controller, onSession]);
  return null;
}

export interface RenownWalletProviderProps {
  /** Wallet adapter descriptors, e.g. `[privyAdapter({ appId }), rainbowAdapter({})]` from `@renown/sdk/wallet/<id>`. Each descriptor's wallet library loads lazily on first login. Keep the array stable (module scope or `useMemo`) — it is snapshotted on mount. `undefined`/empty = redirect-only. */
  adapters: WalletAdapterDescriptor[] | undefined;
  /** Theme handed to each adapter UI: `"light"`, `"dark"`, or `{ mode, accentColor?, accentColorForeground? }`. */
  theme?: WalletTheme;
  children: ReactNode;
}

/** Drop-in provider for Renown in-page wallet sign-in: registers the login activator, lazy-mounts the configured adapters on first click, and merges their controllers for {@link useRenownAuth}. Full walkthrough + examples: the `@powerhousedao/reactor-browser` README ("Renown in-page sign-in") and the Academy Renown authentication guide. Pair with {@link useRenownLoginMethods} to build the login UI. */
export function RenownWalletProvider({
  adapters: adaptersConfig,
  theme,
  children,
}: RenownWalletProviderProps) {
  const [descriptors] = useState(() => adaptersConfig);
  const user = useUser();
  // Eager metadata: enough to detect a redirect return and list login methods
  // without loading any wallet library.
  const metas = useMemo(
    () => descriptors?.map((descriptor) => descriptor.meta) ?? [],
    [descriptors],
  );
  // Mount on a login click / OAuth redirect return, and latch on authentication so
  // we stay mounted for the page's life — a logout->login remount breaks Privy's modal.
  const [activated, setActivated] = useState(
    () =>
      typeof window !== "undefined" &&
      isWalletRedirectReturn(window.location.search, metas),
  );
  if (user && !activated) setActivated(true);
  const active = activated;
  const [adapters, setAdapters] = useState<WalletAdapter[] | null>(null);
  const mountedRef = useRef(new Map<string, MountedAdapter>());
  // Auto-completes sign-in from the session an adapter pushes on an OAuth return.
  const { onSession } = useCompleteRedirectSignIn(metas);

  // Register an activator so login() can mount + lazy-load adapters on click.
  useEffect(() => {
    if (!descriptors) return;
    setWalletActivator(() => {
      setActivated(true);
      return whenWalletControllerReady();
    });
    return () => setWalletActivator(undefined);
  }, [descriptors]);

  // Resolve + mount adapters only once activated; each descriptor's dynamic
  // import (and the wallet library it pulls) fires here, on demand.
  useEffect(() => {
    if (!active || !descriptors) return;
    let cancelled = false;
    void resolveAdapters(descriptors)
      .then((resolved) => {
        if (cancelled) return;
        if (resolved.length === 0) {
          failWalletActivation(
            new Error(
              "No wallet adapters were configured for in-page sign-in.",
            ),
          );
          return;
        }
        setAdapters(resolved);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          failWalletActivation(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active, descriptors]);

  const onController = useCallback(
    (meta: WalletAdapterMeta, controller: WalletController | undefined) => {
      if (controller) mountedRef.current.set(meta.id, { meta, controller });
      else mountedRef.current.delete(meta.id);
      setActiveWalletController(
        mergeControllers(Array.from(mountedRef.current.values())),
      );
    },
    [],
  );

  // Provider tree wraps only the adapter bridges (each library's modal portals
  // to <body>), never `children`, so activating login never remounts the app.
  const walletTree =
    descriptors && active && adapters && adapters.length > 0
      ? adapters.reduceRight<ReactNode>(
          (acc, adapter) => {
            const Provider = adapter.Provider as ComponentType<{
              children: ReactNode;
              theme?: WalletTheme;
            }>;
            return <Provider theme={theme}>{acc}</Provider>;
          },
          <>
            {adapters.map((adapter) => (
              <AdapterControllerBridge
                key={adapter.meta.id}
                adapter={adapter}
                onController={onController}
                onSession={onSession}
              />
            ))}
          </>,
        )
      : null;

  return (
    <>
      {children}
      {walletTree}
    </>
  );
}
