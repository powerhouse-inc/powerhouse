import { Icon } from "#design-system";
import type { FC } from "react";

export interface AccountPopoverLoginProps {
  // Entry point for the sidebar popover; opens the shared login modal, which
  // owns the actual login methods + feedback.
  onLogin: (() => void) | undefined;
}

export const AccountPopoverLogin: FC<AccountPopoverLoginProps> = ({
  onLogin,
}) => {
  const allowLogin = !!onLogin;

  return (
    <div className="p-4">
      <div className="mb-4 flex justify-center">
        <div className="flex h-5.5 w-20.75 items-center justify-center overflow-hidden text-foreground">
          <Icon name="RenownLight" size={83} />
        </div>
      </div>
      <button
        onClick={allowLogin ? onLogin : undefined}
        className={
          allowLogin
            ? "mt-4 flex h-7 w-full cursor-pointer items-center justify-center rounded-lg border border-border bg-transparent text-sm text-foreground active:active-effect"
            : "mt-4 flex h-7 w-full cursor-wait items-center justify-center rounded-lg border border-border bg-transparent text-sm text-foreground"
        }
        type="button"
      >
        <span>Connect</span>
      </button>
    </div>
  );
};
