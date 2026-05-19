import renownShortDark from "#assets/renown-short-dark.png";
import renownShortHoverDark from "#assets/renown-short-hover-dark.png";
import renownShortHover from "#assets/renown-short-hover.png";
import renownShort from "#assets/renown-short.png";
import { useTheme } from "@powerhousedao/reactor-browser";
import { twMerge } from "tailwind-merge";
import { AccountPopoverLogin } from "../account-popover/account-popover-login.js";
import { AccountPopover } from "../account-popover/account-popover.js";

export interface SidebarLoginProps {
  onLogin: (() => void) | undefined;
}

export const SidebarLogin: React.FC<SidebarLoginProps> = ({ onLogin }) => {
  const content = <AccountPopoverLogin onLogin={onLogin} />;
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const src = isDark ? renownShortDark : renownShort;
  const hoverSrc = isDark ? renownShortHoverDark : renownShortHover;

  return (
    <AccountPopover content={content}>
      <div
        className={twMerge(
          "group/sidebar-footer flex w-full items-baseline justify-start text-sm/10 font-semibold text-gray-600 dark:text-slate-100",
          onLogin ? "cursor-pointer" : "cursor-wait",
        )}
      >
        <img
          width={42}
          height={42}
          loading="lazy"
          className="group-hover/sidebar-footer:hidden"
          src={src}
          alt="Renown Login"
        />
        <img
          width={42}
          height={42}
          loading="lazy"
          className="hidden group-hover/sidebar-footer:block"
          src={hoverSrc}
          alt="Renown Login Hover"
        />
      </div>
    </AccountPopover>
  );
};
