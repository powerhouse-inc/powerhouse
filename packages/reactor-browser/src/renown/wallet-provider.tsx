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
import { logger } from "document-model";
import { useRenown, useUser } from "../hooks/renown.js";
import {
  failWalletActivation,
  setActiveWalletController,
  setWalletActivator,
  signIn,
  whenWalletControllerReady,
} from "./utils.js";

// True when this page load is a Privy OAuth redirect return. Read once at mount
// (Privy strips the params after consuming them).
function hadPrivyOAuthReturn(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("privy_oauth_code") || params.has("privy_oauth_state");
}

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
  onSession: (id: string, session: WalletSession | undefined) => void;
}) {
  const { adapter, onController, onSession } = props;
  const controller = adapter.useController();
  useEffect(() => {
    onController(adapter.id, controller);
    return () => onController(adapter.id, undefined);
  }, [adapter.id, controller, onController]);
  // Adapters that push session changes (Privy) let sign-in complete on an OAuth
  // return, where the connect() promise died with the pre-redirect page.
  useEffect(() => {
    if (!controller.subscribe) return;
    return controller.subscribe((session) => onSession(adapter.id, session));
  }, [adapter.id, controller, onSession]);
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
  const renown = useRenown();
  const user = useUser();
  // Latest adapter session that can sign silently (Privy embedded wallet). Non-
  // silent sessions (injected wallets) never auto-sign — that'd pop a prompt.
  const [pendingSilentSession, setPendingSilentSession] =
    useState<WalletSession | null>(null);
  const signingInRef = useRef(false);
  // Arm auto sign-in for the OAuth redirect return only, consumed once. A silent
  // session that lingers after logout must NOT hijack an explicit wallet login.
  const oauthReturnRef = useRef(hadPrivyOAuthReturn());

  const onSession = useCallback(
    (_id: string, session: WalletSession | undefined) => {
      setPendingSilentSession(session?.autoSignIn ? session : null);
    },
    [],
  );

  // Complete Renown sign-in from the session Privy pushes on an OAuth return,
  // once the SDK is ready; disarm as soon as it's handled or a user is present.
  useEffect(() => {
    if (!oauthReturnRef.current) return;
    if (user) {
      oauthReturnRef.current = false;
      return;
    }
    if (!pendingSilentSession || !renown || signingInRef.current) return;
    signingInRef.current = true;
    oauthReturnRef.current = false;
    void Promise.resolve(signIn(pendingSilentSession))
      .catch((error: unknown) =>
        logger.error(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => {
        signingInRef.current = false;
      });
  }, [pendingSilentSession, renown, user]);

  // Register an activator so login() can mount + lazy-load adapters on click.
  useEffect(() => {
    if (!config) return;
    setWalletActivator(() => {
      setActive(true);
      return whenWalletControllerReady();
    });
    return () => setWalletActivator(undefined);
  }, [config]);

  // Privy social OAuth returns via full-page redirect (?privy_oauth_code=…); mount
  // adapters on that load so PrivyProvider consumes the code and resumes login.
  useEffect(() => {
    if (!config || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("privy_oauth_code") || params.has("privy_oauth_state")) {
      setActive(true);
    }
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
