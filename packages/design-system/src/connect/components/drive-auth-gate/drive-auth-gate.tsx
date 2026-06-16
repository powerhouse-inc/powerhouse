import { RenownLogo } from "@powerhousedao/reactor-browser/renown";
import { twMerge } from "tailwind-merge";

export interface DriveAuthGateProps {
  /** Login action; the caller wires this to Renown (e.g. `openRenown`). */
  readonly onLogin?: () => void;
  readonly className?: string;
}

/**
 * Reusable "log in to access this drive" card. Used both as the content of the
 * drive-add auth modal and as the full-page gate shown when the user logs out
 * while inside a protected drive — so the two stay visually identical.
 */
export function DriveAuthGate(props: DriveAuthGateProps) {
  const { onLogin, className } = props;
  return (
    <div
      className={twMerge(
        "flex w-[28rem] max-w-[calc(100%-2rem)] flex-col items-center gap-4 rounded-3xl bg-gray-50 p-8 text-center shadow-2xl ring-1 ring-black/5 dark:bg-slate-700 dark:ring-white/10",
        className,
      )}
    >
      <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50">
        Log in to access this drive
      </h2>
      <p className="text-sm text-gray-600 dark:text-slate-300">
        This drive requires you to sign in with Renown to view or edit it.
      </p>
      <button
        type="button"
        onClick={onLogin}
        className="mt-2 flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
      >
        <span>Log in with</span>
        <RenownLogo width={58} height={16} className="-translate-y-[3px]" />
      </button>
    </div>
  );
}
