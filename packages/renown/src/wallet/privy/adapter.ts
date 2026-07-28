import type {
  ConnectedWallet,
  LoginModalOptions,
  SignTypedDataParams,
} from "@privy-io/react-auth";
import type { SignCredentialTypedData } from "../../credential.js";
import { LoginMethod, type WalletSession } from "../types.js";
import type { PrivyLoginMethod } from "./meta.js";

type Hex = `0x${string}`;
type PrivyLoginMethodId = NonNullable<
  LoginModalOptions["loginMethods"]
>[number];

// Exhaustive over PrivyLoginMethod, so widening that union without adding the
// Privy id here is a compile error.
const PRIVY_METHOD_MAP: Record<PrivyLoginMethod, PrivyLoginMethodId> = {
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
  logout: () => Promise<void>;
  signTypedData: (
    args: Parameters<SignCredentialTypedData>[0],
    address: Hex,
  ) => Promise<Hex>;
}

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

  async connect(method?: LoginMethod): Promise<WalletSession> {
    if (this.session) return this.session;
    if (!this.bindings) {
      throw new Error(
        "PrivyAdapter not bound. Ensure the adapter Provider wraps the app.",
      );
    }

    const chosen = method ?? this.supportedMethods.at(0);
    if (!chosen) {
      throw new Error("PrivyAdapter has no supported login methods configured");
    }
    // PRIVY_METHOD_MAP is total over the methods Privy can drive, so only the
    // configured subset needs checking here.
    if (!this.supportedMethods.includes(chosen)) {
      throw new Error(`PrivyAdapter does not support login method "${chosen}"`);
    }
    const privyMethod = PRIVY_METHOD_MAP[chosen];

    const bindings = this.bindings;
    const oauthProvider = PRIVY_OAUTH_PROVIDERS[chosen];
    return new Promise<WalletSession>((resolve, reject) => {
      this.pending = { resolve, reject };
      const fail = (error: unknown) => {
        this.pending = null;
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      try {
        // initOAuth navigates away, so this promise stays pending until the page
        // unloads; syncFromEmbeddedWallet emits the session on the redirect back.
        if (oauthProvider) {
          bindings.initOAuth({ provider: oauthProvider }).catch(fail);
        } else {
          bindings.openLoginModal({ loginMethods: [privyMethod] });
        }
      } catch (error) {
        fail(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.clearSession();
    if (!this.bindings) return;
    await this.bindings.logout();
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
