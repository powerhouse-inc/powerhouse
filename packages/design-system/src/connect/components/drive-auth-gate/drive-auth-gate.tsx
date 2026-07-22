import { RenownLogo } from "@powerhousedao/reactor-browser/renown";
import { twMerge } from "tailwind-merge";
import {
  RenownLoginMethods,
  type RenownLoginOption,
} from "../renown-login/renown-login-methods.js";

export interface DriveAuthGateProps {
  /** Visual state — `"login"` (anonymous) or `"unauthorized"` (already signed in, not the owner). Defaults to `"login"`. */
  readonly mode?: "login" | "unauthorized";
  /** Login action; the caller wires this to Renown (e.g. `openRenown`). */
  readonly onLogin?: () => void;
  /** Configured login methods; when non-empty the branded method buttons replace the single Renown button. */
  readonly methods?: RenownLoginOption[];
  /** Login-in-progress and last-error feedback, owned by the caller. */
  readonly loading?: boolean;
  readonly error?: string | null;
  /** Logout action used in `"unauthorized"` mode. */
  readonly onLogout?: () => void;
  readonly className?: string;
}

/**
 * Reusable "log in to access this drive" card. Used both as the content of the
 * drive-add auth modal and as the full-page gate shown when the user logs out
 * while inside a protected drive — so the two stay visually identical.
 */
export function DriveAuthGate(props: DriveAuthGateProps) {
  const {
    mode = "login",
    onLogin,
    methods,
    loading,
    error,
    onLogout,
    className,
  } = props;
  const hasMethods = !!methods && methods.length > 0;
  return (
    <div
      className={twMerge(
        "flex w-[28rem] max-w-[calc(100%-2rem)] flex-col items-center gap-4 rounded-3xl bg-background p-8 text-center shadow-2xl ring-1 ring-black/5 dark:ring-white/10",
        className,
      )}
    >
      {mode === "login" ? (
        <>
          <h2 className="text-xl font-semibold text-foreground">
            Log in to access this drive
          </h2>
          <p className="text-sm text-muted-foreground">
            This drive requires you to sign in with Renown to view or edit it.
          </p>
          {hasMethods ? (
            <RenownLoginMethods
              methods={methods}
              loading={loading}
              error={error}
              className="mt-2 max-w-72"
            />
          ) : (
            <>
              <button
                type="button"
                onClick={onLogin}
                disabled={loading}
                className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
              >
                <span>{loading ? "Connecting to" : "Log in with"}</span>
                <RenownLogo
                  width={58}
                  height={16}
                  className="-translate-y-[3px]"
                />
              </button>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </>
          )}
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold text-foreground">
            You don&apos;t have access to this drive
          </h2>
          <p className="text-sm text-muted-foreground">
            The account you&apos;re signed in with isn&apos;t authorized to view
            or edit this drive. Only its owner has access.
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Log out
          </button>
        </>
      )}
    </div>
  );
}
