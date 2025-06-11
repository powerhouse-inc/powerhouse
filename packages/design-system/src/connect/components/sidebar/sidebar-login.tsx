import renownShortHover from "#assets/renown-short-hover.png";
import renownShort from "#assets/renown-short.png";
import {
  AccountPopover,
  AccountPopoverLogin,
} from "../account-popover/index.js";

export interface SidebarLoginProps {
  onLogin: () => void;
}

export const SidebarLogin: React.FC<SidebarLoginProps> = ({ onLogin }) => {
  const content = <AccountPopoverLogin onLogin={onLogin} />;

  return (
    <AccountPopover content={content}>
      <div className="group/sidebar-footer flex w-full cursor-pointer items-baseline justify-start text-sm font-semibold leading-10 text-gray-600">
        <img
          width={42}
          height={42}
          loading="lazy"
          className="group-hover/sidebar-footer:hidden"
          src={renownShort}
        />
        <img
          width={42}
          height={42}
          loading="lazy"
          className="hidden group-hover/sidebar-footer:block"
          src={renownShortHover}
        />
      </div>
    </AccountPopover>
  );
};
