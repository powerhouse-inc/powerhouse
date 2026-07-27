import type { WalletSession } from "@renown/sdk/wallet";
import { isWalletRedirectReturn } from "@renown/sdk/wallet";
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "document-model";
import { useRenown, useUser } from "../hooks/renown.js";
import { completeSignIn } from "./session.js";

export interface CompleteRedirectSignIn {
  /** Session sink for the adapter bridges; a silent session arms auto sign-in. */
  onSession: (id: string, session: WalletSession | undefined) => void;
}

// Completes Renown sign-in from the session an adapter pushes on a full-page
// OAuth return (the original connect() promise died with the pre-redirect page).
export function useCompleteRedirectSignIn(): CompleteRedirectSignIn {
  const renown = useRenown();
  const user = useUser();
  // Latest adapter session that can sign silently (Privy embedded wallet). Non-
  // silent sessions (injected wallets) never auto-sign — that'd pop a prompt.
  const [pendingSilentSession, setPendingSilentSession] =
    useState<WalletSession | null>(null);
  // Arm auto sign-in for the OAuth redirect return only, consumed once. A silent
  // session that lingers after logout must NOT hijack an explicit wallet login.
  const oauthReturnRef = useRef(
    typeof window !== "undefined" &&
      isWalletRedirectReturn(window.location.search),
  );

  const onSession = useCallback(
    (_id: string, session: WalletSession | undefined) => {
      setPendingSilentSession(session?.canSignSilently ? session : null);
    },
    [],
  );

  // Complete sign-in from the session Privy pushes on an OAuth return, once the
  // SDK is ready; disarm as soon as it's handled or a user is present.
  useEffect(() => {
    if (!oauthReturnRef.current) return;
    if (user) {
      oauthReturnRef.current = false;
      return;
    }
    if (!pendingSilentSession || !renown) return;
    oauthReturnRef.current = false;
    void Promise.resolve(completeSignIn(pendingSilentSession)).catch(
      (error: unknown) =>
        logger.error(error instanceof Error ? error.message : String(error)),
    );
  }, [pendingSilentSession, renown, user]);

  return { onSession };
}
