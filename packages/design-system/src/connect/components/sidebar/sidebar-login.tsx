import renownShortHover from "#assets/renown-short-hover.png";
import renownShort from "#assets/renown-short.png";

export interface SidebarLoginProps {
  onLogin: () => void;
}

export const SidebarLogin: React.FC<SidebarLoginProps> = ({ onLogin }) => {
  return (
    <button
      className="group/sidebar-footer flex w-full cursor-pointer items-baseline justify-start text-sm font-semibold leading-10 text-gray-600"
      onClick={onLogin}
    >
      <img className="group-hover/sidebar-footer:hidden" src={renownShort} />
      <img
        className="hidden group-hover/sidebar-footer:block"
        src={renownShortHover}
      />
    </button>
  );
};
