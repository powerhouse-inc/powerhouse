import type { ReactorSessionIdentity } from "@powerhousedao/reactor-browser/rpc";
import type { UserActionSigner } from "@powerhousedao/shared/document-model";
import type { PowerhouseVerifiableCredential } from "@renown/sdk";

/**
 * Who the worker signs as: the identity the tabs post, with the credential its
 * bearers carry (F3d). With nobody signed in, a signature first asks the tabs,
 * which may sign someone in (hosted Connect's browser pseudonym) and answer
 * with their identity; a tab that declines (a page a local server signs in by
 * link) is not asked again until someone signs in and out.
 */

/** How long a signature waits for the tabs' answer. */
const ASK_WAIT_MS = 5_000;

export interface WorkerIdentity {
  readonly current: ReactorSessionIdentity | null;
  /** The signer fields only: a credential has no place on an operation. */
  readonly signerUser: UserActionSigner | undefined;
  /** The credential the bearers carry, if any. */
  readonly credential: PowerhouseVerifiableCredential | undefined;
  /** A tab's identity message. */
  set(user: ReactorSessionIdentity | null): void;
  /** Nobody signed in: asks the tabs, and waits for an answer. */
  ensure(): Promise<void>;
}

export function createWorkerIdentity(o: {
  askTabs: () => void;
  waitMs?: number;
}): WorkerIdentity {
  let current: ReactorSessionIdentity | null = null;
  let asking: Promise<void> | undefined;
  let answered: (() => void) | undefined;
  let declined = false;
  return {
    get current() {
      return current;
    },
    get signerUser() {
      return current
        ? {
            address: current.address,
            chainId: current.chainId,
            networkId: current.networkId,
          }
        : undefined;
    },
    get credential() {
      return current?.credential as PowerhouseVerifiableCredential | undefined;
    },
    set(user) {
      current = user;
      if (user) declined = false;
      answered?.();
    },
    ensure() {
      if (current || declined) return Promise.resolve();
      asking ??= new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, o.waitMs ?? ASK_WAIT_MS);
        answered = () => {
          clearTimeout(timer);
          resolve();
        };
        o.askTabs();
      }).finally(() => {
        asking = undefined;
        answered = undefined;
        if (!current) declined = true;
      });
      return asking;
    },
  };
}
