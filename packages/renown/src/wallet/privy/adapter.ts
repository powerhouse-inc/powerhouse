import type {
  ConnectedWallet,
  LoginModalOptions,
  SignTypedDataParams,
} from "@privy-io/react-auth";
import type { SignCredentialTypedData } from "../../credential.js";
import { LoginMethod, type WalletSession } from "../types.js";
import type { PrivyLoginMethod } from "./meta.js";
import type { PrivyAuthState, SendCodeOptions } from "./types.js";

type Hex = `0x${string}`;
type PrivyLoginMethodId = NonNullable<
  LoginModalOptions["loginMethods"]
>[number];

// Exhaustive over PrivyLoginMethod, so widening that union without adding the
// Privy id here is a compile error.
export const PRIVY_METHOD_MAP: Record<PrivyLoginMethod, PrivyLoginMethodId> = {
  [LoginMethod.WALLET]: "wallet",
  [LoginMethod.GOOGLE]: "google",
  [LoginMethod.APPLE]: "apple",
  [LoginMethod.EMAIL]: "email",
};

type PrivyOAuthProviderId = "google" | "apple";

// Methods Privy can start headlessly with initOAuth. Opening the modal for these
// would only render a single button for a provider the caller already picked.
const PRIVY_OAUTH_PROVIDERS: Partial<
  Record<LoginMethod, PrivyOAuthProviderId>
> = {
  [LoginMethod.GOOGLE]: "google",
  [LoginMethod.APPLE]: "apple",
};

// Privy React functions captured by <PrivyAdapterBridge> via bind(). Until bind
// runs, connect/disconnect calls throw.
export interface PrivyBindings {
  openLoginModal: (options?: LoginModalOptions) => void;
  initOAuth: (options: { provider: PrivyOAuthProviderId }) => Promise<void>;
  sendCode: (options: {
    email: string;
    disableSignup?: boolean;
  }) => Promise<void>;
  loginWithCode: (options: { code: string }) => Promise<void>;
  logout: () => Promise<void>;
  signTypedData: (
    args: Parameters<SignCredentialTypedData>[0],
    address: Hex,
  ) => Promise<Hex>;
}

const INITIAL_STATE: PrivyAuthState = {
  ready: false,
  authenticated: false,
  emailStatus: "initial",
};

interface PendingLogin {
  resolve(session: WalletSession): void;
  reject(error: Error): void;
}

// Framework-agnostic core the bridge drives. Holds the session and pending
// login promise so the class can operate Privy without owning React state.
export class PrivyCore {
  readonly supportedMethods: LoginMethod[];

  private bindings: PrivyBindings | null = null;
  private pending: PendingLogin | null = null;
  private session: WalletSession | undefined = undefined;
  private listeners = new Set<(session: WalletSession | undefined) => void>();
  private state: PrivyAuthState = INITIAL_STATE;
  private stateListeners = new Set<(state: PrivyAuthState) => void>();

  constructor(supportedMethods: LoginMethod[]) {
    this.supportedMethods = supportedMethods;
  }

  bind(bindings: PrivyBindings): () => void {
    this.bindings = bindings;
    return () => {
      if (this.bindings === bindings) this.bindings = null;
    };
  }

  getSession(): WalletSession | undefined {
    return this.session;
  }

  // Push session changes to subscribers, replaying the current one on subscribe.
  // Lets the host complete sign-in when a session arrives with no pending connect().
  subscribe(
    listener: (session: WalletSession | undefined) => void,
  ): () => void {
    this.listeners.add(listener);
    if (this.session) listener(this.session);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(session: WalletSession | undefined): void {
    for (const listener of this.listeners) listener(session);
  }

  getState(): PrivyAuthState {
    return this.state;
  }

  subscribeState(listener: (state: PrivyAuthState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  // Called by the bridge whenever Privy's auth/OTP state changes. Identity-stable
  // while unchanged so useSyncExternalStore consumers don't re-render.
  syncState(next: PrivyAuthState): void {
    const prev = this.state;
    if (
      prev.ready === next.ready &&
      prev.authenticated === next.authenticated &&
      prev.email === next.email &&
      prev.emailStatus === next.emailStatus &&
      prev.emailError === next.emailError
    ) {
      return;
    }
    this.state = next;
    for (const listener of this.stateListeners) listener(next);
  }

  // Called by the bridge when the embedded wallet is available. Builds the
  // session and resolves any pending login promise.
  syncFromEmbeddedWallet(wallet: ConnectedWallet): void {
    const address = wallet.address as Hex;
    const chainId = parseCaip2ChainId(wallet.chainId);

    const signTypedData: SignCredentialTypedData = async (args) => {
      if (!this.bindings) {
        throw new Error("PrivyAdapter not bound (bridge not mounted)");
      }
      return this.bindings.signTypedData(args, address);
    };

    // Privy's embedded wallet signs without a prompt, so a host may auto-complete
    // sign-in with this session after a full-page OAuth redirect return.
    const session: WalletSession = {
      address,
      chainId,
      signTypedData,
      canSignSilently: true,
    };
    this.session = session;
    // A live connect() (in-page popup flow) consumes the session via its promise;
    // otherwise the promise died with the pre-redirect page, so emit to subscribers.
    if (this.pending) {
      this.pending.resolve(session);
      this.pending = null;
    } else {
      this.emit(session);
    }
  }

  clearSession(): void {
    this.session = undefined;
    this.emit(undefined);
  }

  // Called by the bridge on Privy's onError. String codes like `exited_auth_flow`
  // mean the user dismissed the modal.
  handleLoginError(error: unknown): void {
    if (!this.pending) return;
    const err = error instanceof Error ? error : new Error(String(error));
    this.pending.reject(err);
    this.pending = null;
  }

  private requireBindings(): PrivyBindings {
    if (!this.bindings) {
      throw new Error(
        "PrivyAdapter not bound. Ensure the adapter Provider wraps the app.",
      );
    }
    return this.bindings;
  }

  private requireMethod(method: LoginMethod): void {
    if (!this.supportedMethods.includes(method)) {
      throw new Error(`PrivyAdapter does not support login method "${method}"`);
    }
  }

  // Resolves via syncFromEmbeddedWallet once the embedded wallet arrives, or
  // rejects through handleLoginError / the start() failure.
  private awaitSession(
    start: (fail: (error: unknown) => void) => void,
  ): Promise<WalletSession> {
    return new Promise<WalletSession>((resolve, reject) => {
      this.pending = { resolve, reject };
      const fail = (error: unknown) => {
        this.pending = null;
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      try {
        start(fail);
      } catch (error) {
        fail(error);
      }
    });
  }

  async connect(method?: LoginMethod): Promise<WalletSession> {
    if (this.session) return this.session;
    const bindings = this.requireBindings();

    const chosen = method ?? this.supportedMethods.at(0);
    if (!chosen) {
      throw new Error("PrivyAdapter has no supported login methods configured");
    }
    // PRIVY_METHOD_MAP is total over the methods Privy can drive, so only the
    // configured subset needs checking here.
    this.requireMethod(chosen);
    const privyMethod = PRIVY_METHOD_MAP[chosen];
    const oauthProvider = PRIVY_OAUTH_PROVIDERS[chosen];

    return this.awaitSession((fail) => {
      // initOAuth navigates away, so this promise stays pending until the page
      // unloads; syncFromEmbeddedWallet emits the session on the redirect back.
      if (oauthProvider) {
        bindings.initOAuth({ provider: oauthProvider }).catch(fail);
      } else {
        bindings.openLoginModal({ loginMethods: [privyMethod] });
      }
    });
  }

  async sendCode(email: string, options?: SendCodeOptions): Promise<void> {
    this.requireMethod(LoginMethod.EMAIL);
    await this.requireBindings().sendCode({
      email,
      disableSignup: options?.disableSignup,
    });
  }

  async loginWithCode(code: string): Promise<WalletSession> {
    if (this.session) return this.session;
    this.requireMethod(LoginMethod.EMAIL);
    const bindings = this.requireBindings();
    // loginWithCode resolves on authentication; the wallet follows through the
    // bridge (useWallets, or createWallet for a first login).
    return this.awaitSession((fail) => {
      bindings.loginWithCode({ code }).catch(fail);
    });
  }

  async disconnect(): Promise<void> {
    this.clearSession();
    if (!this.bindings) return;
    // When mounted on demand for this logout, Privy may still be restoring its
    // session; its logout needs that to finish.
    await this.whenReady();
    // Re-read: the bridge may have unmounted during the wait.
    const bindings = this.currentBindings();
    if (!bindings) return;
    await bindings.logout();
  }

  private currentBindings(): PrivyBindings | null {
    return this.bindings;
  }

  private whenReady(timeoutMs = 10_000): Promise<void> {
    if (this.state.ready) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        unsubscribe();
        clearTimeout(timer);
        resolve();
      };
      const unsubscribe = this.subscribeState((state) => {
        if (state.ready) done();
      });
      const timer = setTimeout(done, timeoutMs);
    });
  }
}

function parseCaip2ChainId(caip2: string): number {
  const last = caip2.split(":").at(-1);
  const n = Number(last);
  if (!Number.isFinite(n)) {
    throw new Error(
      `PrivyAdapter: could not parse chainId from CAIP-2 "${caip2}"`,
    );
  }
  return n;
}

export type { SignTypedDataParams };
