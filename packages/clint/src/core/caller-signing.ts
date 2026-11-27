import type {
  Action,
  ActionSigningTarget,
} from "@powerhousedao/shared/document-model";
import type { CommandStore } from "./command-control.js";
import { SIGNING_ASKS } from "./forwarded-signing.js";
import type { CallerSession, IdentityConfiguration } from "./types.js";

/**
 * The caller's side of a forwarded command that signs as the caller: what it
 * tells the instance it answers, and the answers. The session opens on the
 * first ask, so a command that writes nothing loads no signing code, and a
 * password is asked here, on the caller's terminal, never by the instance.
 */
export interface CallerAnswers {
  asks: readonly string[];
  onAsk(kind: string, payload: unknown): Promise<unknown>;
}

function refuse(message: string, code = "refused"): Error {
  return Object.assign(new Error(message), { code });
}

/**
 * How a Cli's command line signs when the Cli configures no identity
 * (`Cli.configureIdentity`): as the person's active identity on this
 * computer (the key in `PH_IDENTITY_KEY` when it is set, else their Renown
 * login, else their pseudonym, made at the first signature), with a session
 * labelled `label` (the Cli's name) kept in their home folder. Renown's
 * signing code loads at that first signature only.
 */
export function defaultIdentity(label: string): IdentityConfiguration {
  return {
    label,
    async open(o) {
      const { openSession } = await import("@renown/sdk/identity");
      const session = await openSession({
        dataDir: o.dataDir,
        label: o.label,
        place: "home",
        interactive: o.interactive,
        ...(o.target ? { target: o.target } : {}),
      });
      return {
        signer: session.signer,
        signAction: (action, target, previousStateHash) =>
          session.actionSigner.signAction(
            {
              ...action,
              context: { ...action.context, prevOpHash: previousStateHash },
            },
            target,
          ),
        bearer: (b) => session.bearer(b),
      };
    },
  };
}

/** The action, target and previous state hash of a `sign-action` ask. */
function signRequestOf(payload: unknown): {
  action: Action;
  target: ActionSigningTarget;
  previousStateHash: string;
} {
  const p = payload as {
    action?: Partial<Action>;
    target?: Partial<ActionSigningTarget>;
    previousStateHash?: unknown;
  } | null;
  const action = p?.action;
  const target = p?.target;
  if (
    typeof action?.id !== "string" ||
    typeof action.type !== "string" ||
    typeof action.scope !== "string" ||
    typeof action.timestampUtcMs !== "string" ||
    typeof target?.documentId !== "string" ||
    typeof target.branch !== "string" ||
    typeof p?.previousStateHash !== "string"
  ) {
    throw refuse(
      "The instance asked to sign something that is no action.",
      "bad-request",
    );
  }
  return {
    action: {
      id: action.id,
      type: action.type,
      scope: action.scope,
      timestampUtcMs: action.timestampUtcMs,
      input: action.input,
    } as Action,
    target: { documentId: target.documentId, branch: target.branch },
    previousStateHash: p.previousStateHash,
  };
}

/**
 * How this process answers the asks of a command it forwards. `hold` is
 * called with true while the session opens (a password may be asked) and
 * false after: the command's output waits meanwhile.
 *
 * Nothing is read before the instance asks: whom the caller signs as is
 * answered to `signer`, at the first write, so a command that writes nothing
 * reads no identity and loads none of the code that would.
 */
export function callerAnswers(o: {
  identity: IdentityConfiguration;
  workdir: string;
  dataDir: string;
  interactive: boolean;
  store?: CommandStore;
  hold?: (on: boolean) => void;
}): CallerAnswers {
  let session: Promise<CallerSession> | undefined;
  const open = (): Promise<CallerSession> => {
    if (!session) {
      o.hold?.(true);
      const target = o.store
        ? {
            ...(o.store.url ? { url: o.store.url } : {}),
            ...(o.store.dataDir ? { dataDir: o.store.dataDir } : {}),
          }
        : undefined;
      session = o.identity
        .open({
          workdir: o.workdir,
          dataDir: o.dataDir,
          label: o.identity.label,
          interactive: o.interactive,
          ...(target ? { target } : {}),
        })
        .finally(() => o.hold?.(false));
      session.catch(() => {
        session = undefined;
      });
    }
    return session;
  };
  const opened = open;
  return {
    asks: SIGNING_ASKS,
    async onAsk(kind, payload) {
      switch (kind) {
        case "signer":
          return (await opened()).signer;
        case "sign-action": {
          const request = signRequestOf(payload);
          return (await opened()).signAction(
            request.action,
            request.target,
            request.previousStateHash,
          );
        }
        case "bearer": {
          const expiresIn = (payload as { expiresIn?: unknown } | null)
            ?.expiresIn;
          return {
            token: await (
              await opened()
            ).bearer({
              expiresIn:
                typeof expiresIn === "number" && expiresIn > 0
                  ? Math.min(expiresIn, 3600)
                  : 600,
            }),
          };
        }
        default:
          throw refuse(
            `This process does not answer "${kind}".`,
            "unsupported",
          );
      }
    },
  };
}
