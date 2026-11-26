import type {
  Action,
  ActionSigningTarget,
  AppActionSigner,
  ISigner,
  Signature,
  UserActionSigner,
} from "@powerhousedao/shared/document-model";

/**
 * Why a caller's write is refused: an action it asked this host to sign
 * (`unsigned`), or an action signed by a key that names no user
 * (`no-identity`).
 */
export type UnsignedWriteKind = "unsigned" | "no-identity";

/**
 * A caller's write that nobody signed for it: no host signs for its callers,
 * so an action reaches the reactor signed by its caller, or the write is
 * refused before anything is submitted. The host's door turns it into its own
 * refusal, naming the field and the caller.
 */
export class UnsignedWriteError extends Error {
  readonly kind: UnsignedWriteKind;
  /** The type of the refused action. */
  readonly actionType: string;

  constructor(kind: UnsignedWriteKind, actionType: string) {
    super(
      kind === "unsigned"
        ? `Refused: this host signs no writes for its callers; ${actionType} is not signed by its caller`
        : `Refused: ${actionType} is signed by a key that names no user`,
    );
    this.name = "UnsignedWriteError";
    this.kind = kind;
    this.actionType = actionType;
  }

  static override isError(error: unknown): error is UnsignedWriteError {
    return Error.isError(error) && error.name === "UnsignedWriteError";
  }
}

/** The signer a caller delegated to this host for the current request, if any. */
export type CallerSignerResolver = () => ISigner | undefined;

export type CallerSignerOptions = {
  /**
   * The signer a caller delegated to this host, read per action: a host
   * session the request runs in (F3e part 2). Without one, every action this
   * signer is asked to sign is refused.
   */
  resolve?: CallerSignerResolver;
  /** Told of every refusal before it is thrown, so a door can name it. */
  onRefused?: (error: UnsignedWriteError) => void;
};

/**
 * The signer of a host's caller writes (`callerWrite`): it signs nothing of
 * its own. An action already signed passes unchanged, unless its key names no
 * user; an action it is asked to sign is signed by the signer the caller
 * delegated for this request, or refused with {@link UnsignedWriteError}. The
 * host's own work keeps the instance signer.
 */
export class CallerSigner implements ISigner {
  readonly #resolve: CallerSignerResolver;
  readonly #onRefused: ((error: UnsignedWriteError) => void) | undefined;

  constructor(options: CallerSignerOptions = {}) {
    this.#resolve = options.resolve ?? (() => undefined);
    this.#onRefused = options.onRefused;
  }

  get user(): UserActionSigner | undefined {
    return this.#resolve()?.user;
  }

  get app(): AppActionSigner | undefined {
    return this.#resolve()?.app;
  }

  get publicKey(): CryptoKey {
    return (this.#resolve()?.publicKey ?? {}) as CryptoKey;
  }

  sign(data: Uint8Array): Promise<Uint8Array> {
    const delegate = this.#resolve();
    if (!delegate) {
      return Promise.reject(this.#refuse("unsigned", "a document header"));
    }
    return delegate.sign(data);
  }

  verify(data: Uint8Array, signature: Uint8Array): Promise<void> {
    const delegate = this.#resolve();
    if (!delegate) {
      return Promise.reject(
        new Error("A caller signer verifies nothing without a delegate"),
      );
    }
    return delegate.verify(data, signature);
  }

  signAction(
    action: Action,
    target: ActionSigningTarget,
    abortSignal?: AbortSignal,
  ): Promise<Signature> {
    const delegate = this.#resolve();
    if (!delegate) {
      return Promise.reject(this.#refuse("unsigned", action.type));
    }
    return delegate.signAction(action, target, abortSignal);
  }

  /** Refuses an action its caller signed with a key that names no user. */
  admitSigned(action: Action): void {
    if (!action.context?.signer?.user?.address) {
      throw this.#refuse("no-identity", action.type);
    }
  }

  #refuse(kind: UnsignedWriteKind, actionType: string): UnsignedWriteError {
    const error = new UnsignedWriteError(kind, actionType);
    this.#onRefused?.(error);
    return error;
  }
}

/** Whether `signer` signs a host's caller writes. */
export function isCallerSigner(signer: ISigner): signer is CallerSigner {
  return signer instanceof CallerSigner;
}
