import { resolveAdapters } from "@renown/sdk/wallet";
import type {
  LoginMethod,
  WalletAdapter,
  WalletAdaptersConfig,
  WalletController,
  WalletSession,
  WalletTheme,
} from "@renown/sdk/wallet";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  failWalletActivation,
  setActiveWalletController,
  setWalletActivator,
  whenWalletControllerReady,
} from "./utils.js";

// Merge per-adapter controllers into one. A requested method routes to the
// adapter that supports it; a method-less connect uses the first adapter.
function mergeControllers(
  controllers: WalletController[],
): WalletController | undefined {
  if (controllers.length === 0) return undefined;
  return {
    supportedMethods: Array.from(
      new Set(controllers.flatMap((c) => c.supportedMethods)),
    ),
    connect(method?: LoginMethod): Promise<WalletSession> {
      if (method) {
        const target = controllers.find((c) =>
          c.supportedMethods.includes(method),
        );
        if (!target) {
          throw new Error(
            `No wallet adapter supports login method "${method}"`,
          );
        }
        return target.connect(method);
      }
      const chosen = controllers.at(0);
      if (!chosen) throw new Error("No wallet adapter available");
      return chosen.connect(method);
    },
    async disconnect(): Promise<void> {
      await Promise.all(controllers.map((c) => c.disconnect()));
    },
    getSession(): WalletSession | undefined {
      for (const c of controllers) {
        const session = c.getSession();
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
  onController: (id: string, controller: WalletController | undefined) => void;
}) {
  const { adapter, onController } = props;
  const controller = adapter.useController();
  useEffect(() => {
    onController(adapter.id, controller);
    return () => onController(adapter.id, undefined);
  }, [adapter.id, controller, onController]);
  return null;
}

export interface RenownWalletProviderProps {
  /** Per-adapter wallet config (e.g. `connect.renown.adapters`); a key's presence enables that adapter. Libraries load lazily on first login; `undefined`/empty = redirect-only. */
  adapters: WalletAdaptersConfig | undefined;
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
  const [config] = useState(() => adaptersConfig);
  const [active, setActive] = useState(false);
  const [adapters, setAdapters] = useState<WalletAdapter[] | null>(null);
  const controllersRef = useRef(new Map<string, WalletController>());

  // Register an activator so login() can mount + lazy-load adapters on click.
  useEffect(() => {
    if (!config) return;
    setWalletActivator(() => {
      setActive(true);
      return whenWalletControllerReady();
    });
    return () => setWalletActivator(undefined);
  }, [config]);

  // Resolve + mount adapters only once activated; the dynamic import (and the
  // wallet library it pulls) fires here, on demand, not at startup.
  useEffect(() => {
    if (!active || !config) return;
    let cancelled = false;
    void resolveAdapters(config)
      .then((resolved) => {
        if (cancelled) return;
        if (resolved.length === 0) {
          failWalletActivation(
            new Error(
              "No wallet adapters could be loaded. Check that the configured adapters' peer dependencies are installed.",
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
  }, [active, config]);

  const onController = useCallback(
    (id: string, controller: WalletController | undefined) => {
      if (controller) controllersRef.current.set(id, controller);
      else controllersRef.current.delete(id);
      setActiveWalletController(
        mergeControllers(Array.from(controllersRef.current.values())),
      );
    },
    [],
  );

  // Provider tree wraps only the adapter bridges (each library's modal portals
  // to <body>), never `children`, so activating login never remounts the app.
  const walletTree =
    config && active && adapters && adapters.length > 0
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
                key={adapter.id}
                adapter={adapter}
                onController={onController}
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
