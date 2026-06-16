import { RenownLoginButton } from "@powerhousedao/reactor-browser/renown";
import { twMerge } from "tailwind-merge";

export interface DriveAuthGateProps {
  /** Login action; defaults to the Renown redirect when omitted. */
  readonly onLogin?: () => void;
  readonly darkMode?: boolean;
  readonly className?: string;
}

/**
 * Shown in place of the content area when a drive requires the user to log in.
 * Presentational only — rendered when the caller has already decided the user
 * is gated. The CTA delegates to {@link RenownLoginButton}.
 */
export function DriveAuthGate(props: DriveAuthGateProps) {
  const { onLogin, darkMode, className } = props;
  return (
    <div
      className={twMerge(
        "flex h-full flex-col items-center justify-center gap-4 p-8 text-center",
        className,
      )}
    >
      <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50">
        Log in to access this drive
      </h2>
      <p className="max-w-md text-sm text-gray-600 dark:text-slate-300">
        This drive requires you to sign in with Renown to view or edit it.
      </p>
      <RenownLoginButton onLogin={onLogin} darkMode={darkMode} />
    </div>
  );
}
