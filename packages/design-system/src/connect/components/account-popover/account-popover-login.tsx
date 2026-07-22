import { Icon } from "#design-system";
import type { FC } from "react";
import {
  RenownLoginMethods,
  type RenownLoginOption,
} from "../renown-login/renown-login-methods.js";

export interface AccountPopoverLoginProps {
  onLogin: (() => void) | undefined;
  // Configured login methods (wallet, Google, email, …). When non-empty the
  // branded method buttons are shown; otherwise the single Connect button.
  methods?: RenownLoginOption[];
  // Login-in-progress and last-error feedback, provided by the caller. This
  // component stays agnostic — it renders state, it doesn't own it.
  loading?: boolean;
  error?: string | null;
}

export const AccountPopoverLogin: FC<AccountPopoverLoginProps> = ({
  onLogin,
  methods,
  loading = false,
  error,
}) => {
  const hasMethods = !!methods && methods.length > 0;
  const allowLogin = !loading && !!onLogin;

  return (
    <div className="p-4">
      <div className="mb-4 flex justify-center">
        <div className="flex h-5.5 w-20.75 items-center justify-center overflow-hidden text-foreground">
          <Icon name="RenownLight" size={83} />
        </div>
      </div>
      {hasMethods ? (
        <RenownLoginMethods methods={methods} loading={loading} error={error} />
      ) : (
        <>
          <button
            onClick={allowLogin ? onLogin : undefined}
            className={
              allowLogin
                ? "flex h-10 w-full cursor-pointer items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85 active:active-effect"
                : "flex h-10 w-full cursor-wait items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground opacity-60"
            }
            type="button"
          >
            {loading ? (
              <Icon name="Reload" size={14} className="animate-spin" />
            ) : (
              <span>Connect</span>
            )}
          </button>
          {error ? (
            <p className="mt-2 text-center text-xs text-destructive">{error}</p>
          ) : null}
        </>
      )}
    </div>
  );
};
