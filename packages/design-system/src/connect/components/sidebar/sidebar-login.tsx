import renownHover from "@/assets/renown-hover.png";
import renownShortHover from "@/assets/renown-short-hover.png";
import renownShort from "@/assets/renown-short.png";
import renown from "@/assets/renown.png";
export interface SidebarLoginProps {
  onLogin: () => void;
}

export const SidebarLogin: React.FC<SidebarLoginProps> = ({ onLogin }) => {
  return (
    <>
      {/* full-size version for expanded */}
      <button
        className="group/sidebar-footer expanded:flex hidden w-full cursor-pointer items-baseline justify-start text-sm font-semibold leading-10 text-gray-600"
        onClick={onLogin}
      >
        <span>Login with</span>
        <img
          className="ml-2 h-5 group-hover/sidebar-footer:hidden"
          src={renown}
        />
        <img
          className="ml-2 hidden h-5 group-hover/sidebar-footer:block"
          src={renownHover}
        />
      </button>
      {/* small version for collapsed */}
      <button
        aria-label="Login with Renown"
        className="group/sidebar-footer collapsed:grid hidden w-full cursor-pointer place-items-center p-1"
        onClick={onLogin}
      >
        <img className="group-hover/sidebar-footer:hidden" src={renownShort} />
        <img
          className="hidden group-hover/sidebar-footer:block"
          src={renownShortHover}
        />
      </button>
    </>
  );
};
