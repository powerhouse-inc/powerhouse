import renownShortDark from "#assets/renown-short-dark.png";
import renownShortHoverDark from "#assets/renown-short-hover-dark.png";
import renownShortHover from "#assets/renown-short-hover.png";
import renownShort from "#assets/renown-short.png";
import { useTheme } from "@powerhousedao/reactor-browser";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { AccountPopoverLogin } from "../account-popover/account-popover-login.js";
import { AccountPopover } from "../account-popover/account-popover.js";

export interface SidebarLoginProps {
  // Opens the login modal (e.g. showPHModal({ type: "login" })).
  onLogin: (() => void) | undefined;
}

// Anchored popover with a Connect entry point; clicking Connect closes the
// popover and hands off to the caller's login modal (onLogin).
export const SidebarLogin: React.FC<SidebarLoginProps> = ({ onLogin }) => {
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const src = isDark ? renownShortDark : renownShort;
  const hoverSrc = isDark ? renownShortHoverDark : renownShortHover;

  const content = (
    <AccountPopoverLogin
      onLogin={
        onLogin
          ? () => {
              setOpen(false);
              onLogin();
            }
          : undefined
      }
    />
  );

  return (
    <AccountPopover open={open} onOpenChange={setOpen} content={content}>
      <div
        className={twMerge(
          "group/sidebar-footer flex w-full items-baseline justify-start text-sm/10 font-semibold text-foreground",
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
