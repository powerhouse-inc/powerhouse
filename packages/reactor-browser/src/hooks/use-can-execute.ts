import type {
  ActionCandidate,
  ActionEvaluations,
  Evaluation,
} from "@powerhousedao/reactor";
import { AuthEnforcementDisabledError } from "@powerhousedao/reactor";
import type { AuthSubject } from "@powerhousedao/shared/document-model";
import type { LoginStatus, User } from "@renown/sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDocumentSafe } from "./document-cache.js";
import { useReactorClientModule } from "./reactor.js";
import { useLoginStatus, useUser } from "./renown.js";

/**
 * Where an evaluation stands.
 *
 * `unsupported` is not a verdict. It says this deployment answers no
 * authorization preflight -- because no reactor client module is set, or because
 * the reactor's authEnforcement flag is off -- so a caller should render its
 * controls as it did before it asked, and let the submit path refuse. Reading it
 * as a denial would disable every control wherever enforcement is off.
 */
export type CanExecuteStatus =
  | "idle"
  | "loading"
  | "ready"
  | "unsupported"
  | "error";

type InternalState = {
  status: CanExecuteStatus;
  evaluations?: Evaluation[];
  allAllowed?: boolean;
  anyAllowed?: boolean;
  allDenied?: boolean;
  anyDenied?: boolean;
  error?: Error;
};

/** What `useCanExecute` returns; exported so consumers can name it. */
export type CanExecuteState = InternalState & {
  refetch: () => void;
};

const IDLE: InternalState = { status: "idle" };
const LOADING: InternalState = { status: "loading" };
const UNSUPPORTED: InternalState = { status: "unsupported" };

function readyState(answer: ActionEvaluations): InternalState {
  return {
    status: "ready",
    evaluations: answer.evaluations,
    allAllowed: answer.allAllowed,
    anyAllowed: answer.anyAllowed,
    allDenied: answer.allDenied,
    anyDenied: answer.anyDenied,
  };
}

/**
 * Whether the subject the reactor client would decide for now is the one it is
 * going to keep.
 *
 * Renown's login status is the signal. Only `checking` is transient --
 * mid-login, about to resolve -- and `authorized` without a user yet is still
 * mid-resolution. Everything else is a steady state: `initial` is the anonymous
 * subject for a user who never logged in or just logged out (a restored session
 * is `authorized` from construction, so `initial` is not a pre-login window),
 * and `not-authorized` is a failed login, anonymous too.
 *
 * An absent status counts as unsettled, which is one render in a host that wires
 * renown -- and forever in a host that does not. Such a host names its subject
 * through the `subject` parameter instead, which needs nothing to settle.
 */
function subjectSettled(
  loginStatus: LoginStatus | "loading" | undefined,
  user: User | undefined,
): boolean {
  if (loginStatus === "authorized") {
    return user !== undefined;
  }
  return loginStatus === "initial" || loginStatus === "not-authorized";
}

/**
 * Predicts whether the current subject may execute each of a set of candidate
 * operations on one document, so a UI can disable a control rather than offer an
 * action that fails on submit.
 *
 * The answer is a prediction and not a promise: the submit path is the only
 * authority, and this cannot reproduce the append condition real admission
 * compiles. Treat an allow as "worth offering", never as "will succeed", and
 * keep handling the submit's refusal.
 *
 * A candidate whose verdict depends on its input has to carry that input, since
 * a conditional grant reads it. A candidate standing for a form the user has not
 * filled in yet predicts the verdict an empty form earns.
 *
 * Deliberately reads the client off the reactor client module rather than
 * through `useReactorClient`: the latter hands back the minimal browser client
 * contract, which does not carry the preflight, and the plain-GraphQL setup that
 * implements it sets no module at all. No module therefore reports
 * `unsupported`.
 *
 * Re-evaluated when the document's revision moves, which covers a policy change
 * written to the document being asked about. Two gaps are known and accepted:
 *
 * - A group membership change is a write to the *group* document, so it fires no
 *   change event for this one. A group-gated grant can therefore be stale here
 *   until something else re-evaluates.
 * - A change event carries no scope, so any write to the document re-evaluates,
 *   including one that cannot affect a verdict.
 *
 * @param documentId - The document the candidates target, or null/undefined to stay idle
 * @param candidates - Operations to predict a verdict for. Read by content, so an inline array is fine
 * @param branch - Branch to evaluate against, defaulting to main
 * @param subject - Optional subject to decide for instead of the client's signer
 */
export function useCanExecute(
  documentId: string | null | undefined,
  candidates: ActionCandidate[],
  branch = "main",
  subject?: AuthSubject,
): CanExecuteState {
  const client = useReactorClientModule()?.client;
  const loginStatus = useLoginStatus();
  const user = useUser();
  const revision = useDocumentSafe(documentId).data?.header.revision;

  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<InternalState>(IDLE);

  // Content, not identity. A caller writes its candidate list inline, so the
  // array is new on every render; keying the effect off it would re-evaluate
  // forever. The memo hands back the array from the render whose content
  // changed, so the values stay exactly what the caller passed.
  const candidateKey = JSON.stringify(candidates);
  const subjectKey = JSON.stringify(subject);
  const stableCandidates = useMemo(() => candidates, [candidateKey]);
  const stableSubject = useMemo(() => subject, [subjectKey]);

  const settled = subject !== undefined || subjectSettled(loginStatus, user);
  const revisionKey = JSON.stringify(revision);

  const refetch = useCallback(() => {
    setNonce((count) => count + 1);
  }, []);

  useEffect(() => {
    if (client === undefined) {
      setState(UNSUPPORTED);
      return;
    }
    if (!documentId) {
      setState(IDLE);
      return;
    }
    if (!settled) {
      setState(LOADING);
      return;
    }

    let active = true;
    setState(LOADING);

    const evaluate = async (): Promise<void> => {
      let next: InternalState;
      try {
        next = readyState(
          await client.evaluateActions(
            documentId,
            branch,
            stableCandidates,
            stableSubject,
          ),
        );
      } catch (error) {
        // Detected by name: the class identity does not survive the
        // SharedWorker RPC boundary, which rebuilds a thrown error from its
        // name and message.
        next = AuthEnforcementDisabledError.isError(error)
          ? UNSUPPORTED
          : {
              status: "error",
              error: Error.isError(error) ? error : new Error(String(error)),
            };
      }

      if (active) {
        setState(next);
      }
    };

    void evaluate();

    return () => {
      active = false;
    };
  }, [
    client,
    documentId,
    branch,
    stableCandidates,
    stableSubject,
    settled,
    revisionKey,
    nonce,
  ]);

  return { ...state, refetch };
}
