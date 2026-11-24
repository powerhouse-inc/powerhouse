import { AsyncLocalStorage } from "node:async_hooks";
import type {
  Action,
  ActionSigningTarget,
  ISigner,
  Signature,
} from "@powerhousedao/shared/document-model";

/**
 * A forwarded command signs as its caller. The command runs in the instance
 * (see `command-control.ts`); the caller's key stays in the caller's process.
 * While the command runs, each action the instance's reactor client signs is
 * sent back over the open control connection (`sign-action`), and the caller
 * signs it, as an SSH agent signs for a forwarded session. The bearer of the
 * command's requests is the caller's too (`bearer`).
 *
 * The scope follows the command's asynchronous calls, as its output scope
 * does (`forwarded-output.ts`). Once the command ended, work it left running
 * cannot sign: it gets {@link CommandEndedError}, never the instance's own
 * signer. Outside any command, and in {@link asOwnSigner}, the instance signs
 * as itself (for a Cli, the signer its reactor configuration gives: its
 * agent's session).
 */

/** What an action's `context.signer` names, apart from its signatures. */
export interface SignerIdentity {
  user: { address: string; networkId: string; chainId: number };
  app: { name: string; key: string };
}

/** The asks a caller answers so that its command signs as the caller. */
export const SIGNING_ASKS = ["signer", "sign-action", "bearer"] as const;

/** What `hello` says when this instance's commands sign as their callers. */
export const COMMAND_SIGNING = 1;

/** Work a forwarded command left running tried to sign after the command ended. */
export class CommandEndedError extends Error {
  constructor() {
    super(
      "The command that started this work has ended: work it left running cannot sign as its caller.",
    );
    this.name = "CommandEndedError";
  }
}

/** How a running command reaches its caller. */
export interface CallerAsks {
  /** The identity the request carried, when the caller knew it already. */
  signer?: SignerIdentity;
  asks: ReadonlySet<string>;
  ask(kind: string, payload?: unknown): Promise<unknown>;
}

/** The caller's signer and bearer, for the command that runs for it. */
export interface CallerSigning {
  signer(): Promise<ISigner>;
  /** Undefined when the caller does not lend its bearer. */
  bearer(): Promise<string | undefined>;
}

interface Scope {
  open: boolean;
  caller: CallerSigning;
}

const scopes = new AsyncLocalStorage<Scope | undefined>();

function isIdentity(value: unknown): value is SignerIdentity {
  const v = value as Partial<SignerIdentity> | undefined;
  return (
    typeof v?.user?.address === "string" &&
    typeof v.user.networkId === "string" &&
    typeof v.user.chainId === "number" &&
    typeof v.app?.name === "string" &&
    typeof v.app.key === "string" &&
    v.user.address !== "" &&
    v.app.key !== ""
  );
}

function isSignature(value: unknown, key: string): value is Signature {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    value.every((part) => typeof part === "string") &&
    value[1] === key
  );
}

/**
 * An `ISigner` whose actions the caller signs. Only actions are forwarded:
 * raw bytes would make the caller sign whatever it is handed.
 */
export function forwardedSigner(
  identity: SignerIdentity,
  ask: CallerAsks["ask"],
): ISigner {
  const signer = {
    user: { ...identity.user },
    app: { ...identity.app },
    sign: () =>
      Promise.reject(
        new Error("A forwarded command's caller signs actions only."),
      ),
    verify: () =>
      Promise.reject(
        new Error("A forwarded command's caller signs actions only."),
      ),
    async signAction(
      action: Action,
      target: ActionSigningTarget,
      abortSignal?: AbortSignal,
    ): Promise<Signature> {
      abortSignal?.throwIfAborted();
      const tuple = await ask("sign-action", {
        action: {
          id: action.id,
          type: action.type,
          scope: action.scope,
          input: action.input,
          timestampUtcMs: action.timestampUtcMs,
        },
        target: { documentId: target.documentId, branch: target.branch },
        previousStateHash: action.context?.prevOpHash ?? "",
      });
      if (!isSignature(tuple, identity.app.key)) {
        throw new Error(
          `The caller answered no signature of ${identity.app.key} for action ${action.id}.`,
        );
      }
      return tuple;
    },
  };
  // Not enumerable, so that copying the signer does not read it.
  Object.defineProperty(signer, "publicKey", {
    enumerable: false,
    get(): CryptoKey {
      throw new Error(
        "A forwarded command's signer has no key here: its caller holds it.",
      );
    },
  });
  return signer as unknown as ISigner;
}

/** A bearer is minted for ten minutes and kept until one is left. */
const BEARER_SECONDS = 600;
const BEARER_MARGIN_MS = 60_000;

/** The signing of a command whose caller lists the {@link SIGNING_ASKS}. */
export function callerSigningOf(caller: CallerAsks): CallerSigning | undefined {
  if (!caller.asks.has("sign-action")) return undefined;
  let signer: Promise<ISigner> | undefined;
  let bearer: { token: string; until: number } | undefined;
  const identity = async (): Promise<SignerIdentity> => {
    if (caller.signer) return caller.signer;
    const answer = await caller.ask("signer");
    if (!isIdentity(answer)) {
      throw new Error("The caller named no identity to sign as.");
    }
    return answer;
  };
  return {
    signer: () =>
      (signer ??= identity()
        .then((known) =>
          forwardedSigner(known, (kind, payload) => caller.ask(kind, payload)),
        )
        .catch((error: unknown) => {
          signer = undefined;
          throw error;
        })),
    bearer: async () => {
      if (!caller.asks.has("bearer")) return undefined;
      if (bearer && bearer.until > Date.now()) return bearer.token;
      const answer = (await caller.ask("bearer", {
        expiresIn: BEARER_SECONDS,
      })) as { token?: unknown } | null;
      if (typeof answer?.token !== "string" || answer.token === "") {
        return undefined;
      }
      bearer = {
        token: answer.token,
        until: Date.now() + BEARER_SECONDS * 1000 - BEARER_MARGIN_MS,
      };
      return bearer.token;
    },
  };
}

/** Runs `work` signing as `caller` until it settles. */
export function withCallerSigning<T>(
  caller: CallerSigning | undefined,
  work: () => Promise<T>,
): Promise<T> {
  if (!caller) return scopes.run(undefined, work);
  const scope: Scope = { open: true, caller };
  let running: Promise<T>;
  try {
    running = scopes.run(scope, work);
  } catch (error) {
    scope.open = false;
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
  return running.finally(() => {
    scope.open = false;
  });
}

/** Runs `fn` signing as the instance, whatever command called (an agent's turn, a listener). */
export function asOwnSigner<T>(fn: () => T): T {
  return scopes.getStore() ? scopes.run(undefined, fn) : fn();
}

/**
 * The signer of a write made now: the caller's while its command runs,
 * {@link CommandEndedError} once it ended, else `own`.
 */
export function signerForWrite(
  own: (() => ISigner | undefined) | undefined,
): ISigner | undefined | Promise<ISigner> {
  const scope = scopes.getStore();
  if (scope?.open) return scope.caller.signer();
  if (scope) throw new CommandEndedError();
  return own?.();
}

/**
 * The bearer of a request made now: the caller's while its command runs and
 * the caller lends one, else `own`'s.
 */
export async function bearerForRequest(
  own: (() => Promise<string | undefined>) | undefined,
): Promise<string | undefined> {
  const scope = scopes.getStore();
  if (scope?.open) {
    const lent = await scope.caller.bearer();
    if (lent !== undefined) return lent;
  }
  return own?.();
}
