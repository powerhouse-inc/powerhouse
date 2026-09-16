import { RenownLogo } from "@powerhousedao/reactor-browser/renown";
import { twMerge } from "tailwind-merge";

export interface DriveAuthGateProps {
  /** Visual state — `"login"` (anonymous) or `"unauthorized"` (already signed in, not the owner). Defaults to `"login"`. */
  readonly mode?: "login" | "unauthorized";
  /** Opens the login flow (e.g. `showPHModal({ type: "login" })`); the login methods live in that modal, not here. */
  readonly onLogin?: () => void;
  /** Logout action used in `"unauthorized"` mode. */
  readonly onLogout?: () => void;
  /** When set, renders a close control in the top-right corner. Omit it for a card with no way out. */
  readonly onClose?: () => void;
  readonly className?: string;
}

// Reusable "log in to access this drive" card (drive-add auth modal + full-page
// gate). It only shows the message + a trigger; login methods live in the modal.
export function DriveAuthGate(props: DriveAuthGateProps) {
  const { mode = "login", onLogin, onLogout, onClose, className } = props;
  return (
    <div
      className={twMerge(
        "relative flex w-[28rem] max-w-[calc(100%-2rem)] flex-col items-center gap-4 rounded-3xl bg-background p-8 text-center shadow-2xl ring-1 ring-black/5 dark:ring-white/10",
        className,
      )}
    >
      {onClose ? (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-4 right-4 flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CloseGlyph />
        </button>
      ) : null}
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

// Inline so the card stays free of the design-system barrel, which re-exports
// this file.
function CloseGlyph() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={14}
      height={14}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <path d="M2 2 L12 12 M12 2 L2 12" />
    </svg>
  );
}
