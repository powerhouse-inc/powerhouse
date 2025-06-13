import { Icon } from "#powerhouse";
import { type FC, useState } from "react";
import { twMerge } from "tailwind-merge";

export interface AccountPopoverLoginProps {
  onLogin: (() => void) | undefined;
}

export const AccountPopoverLogin: FC<AccountPopoverLoginProps> = ({
  onLogin,
}) => {
  const [loading, setLoading] = useState(false);

  const allowLogin = !loading && !!onLogin;

  const content = loading ? (
    <Icon name="Reload" size={14} className="animate-spin" />
  ) : (
    <span>Connect</span>
  );

  const handleLogin = () => {
    if (onLogin) {
      setLoading(true);
      onLogin();
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex justify-center">
        <div className="flex h-[22px] w-[83px] items-center justify-center overflow-hidden">
          <Icon name="RenownLight" size={83} />
        </div>
      </div>
      <button
        onClick={allowLogin ? handleLogin : undefined}
        className={twMerge(
          "mt-4 flex h-7 w-full cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-transparent text-sm active:opacity-70",
          allowLogin ? "cursor-pointer" : "cursor-wait",
        )}
        type="button"
      >
        {content}
      </button>
    </div>
  );
};
