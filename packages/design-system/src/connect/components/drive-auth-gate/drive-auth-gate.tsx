import { RenownLogo } from "@powerhousedao/reactor-browser/renown";
import { twMerge } from "tailwind-merge";

export interface DriveAuthGateProps {
  /** Visual state — `"login"` (anonymous) or `"unauthorized"` (already signed in, not the owner). Defaults to `"login"`. */
  readonly mode?: "login" | "unauthorized";
  /** Opens the login flow (e.g. `showPHModal({ type: "login" })`); the login methods live in that modal, not here. */
  readonly onLogin?: () => void;
  /** Logout action used in `"unauthorized"` mode. */
  readonly onLogout?: () => void;
  readonly className?: string;
}

// Reusable "log in to access this drive" card (drive-add auth modal + full-page
// gate). It only shows the message + a trigger; login methods live in the modal.
export function DriveAuthGate(props: DriveAuthGateProps) {
  const { mode = "login", onLogin, onLogout, className } = props;
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
          <button
            type="button"
            onClick={onLogin}
            className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span>Log in with</span>
            <RenownLogo width={58} height={16} className="-translate-y-[3px]" />
          </button>
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
