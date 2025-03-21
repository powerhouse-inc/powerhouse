import { Icon } from "#powerhouse";
import { type FC, useState } from "react";

export interface AccountPopoverLoginProps {
  onLogin: () => void;
}

export const AccountPopoverLogin: FC<AccountPopoverLoginProps> = ({
  onLogin,
}) => {
  const [loading, setLoading] = useState(false);

  const content = loading ? (
    <Icon name="Reload" size={14} className="animate-spin" />
  ) : (
    <span>Connect</span>
  );

  const handleLogin = () => {
    setLoading(true);
    onLogin();
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex justify-center">
        <div className="flex h-[22px] w-[83px] items-center justify-center overflow-hidden">
          <Icon name="RenownLight" size={83} />
        </div>
      </div>
      <button
        onClick={handleLogin}
        className="mt-4 flex h-7 w-full cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-transparent text-sm active:opacity-70"
        type="button"
      >
        {content}
      </button>
    </div>
  );
};
