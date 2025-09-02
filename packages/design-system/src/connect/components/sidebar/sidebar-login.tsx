import renownShortHover from "@powerhousedao/design-system/assets/renown-short-hover.png";
import renownShort from "@powerhousedao/design-system/assets/renown-short.png";
import { twMerge } from "tailwind-merge";
import {
  AccountPopover,
  AccountPopoverLogin,
} from "../account-popover/index.js";

export interface SidebarLoginProps {
  onLogin: (() => void) | undefined;
}

export const SidebarLogin: React.FC<SidebarLoginProps> = ({ onLogin }) => {
  const content = <AccountPopoverLogin onLogin={onLogin} />;

  return (
    <AccountPopover content={content}>
      <div
        className={twMerge(
          "group/sidebar-footer flex w-full items-baseline justify-start text-sm font-semibold leading-10 text-gray-600",
          onLogin ? "cursor-pointer" : "cursor-wait",
        )}
      >
        <img
          width={42}
          height={42}
          loading="lazy"
          className="group-hover/sidebar-footer:hidden"
          src={renownShort}
          alt="Renown Login"
        />
        <img
          width={42}
          height={42}
          loading="lazy"
          className="hidden group-hover/sidebar-footer:block"
          src={renownShortHover}
          alt="Renown Login Hover"
        />
      </div>
    </AccountPopover>
  );
};
