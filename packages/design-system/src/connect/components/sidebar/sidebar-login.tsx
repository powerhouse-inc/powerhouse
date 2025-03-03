import renownHover from "@/assets/renown-hover.png";
import renown from "@/assets/renown.png";
export interface SidebarLoginProps {
  onLogin: () => void;
}

export const SidebarLogin: React.FC<SidebarLoginProps> = ({ onLogin }) => {
  return (
    <button
      className="group/sidebar-footer flex w-full cursor-pointer items-baseline justify-start text-sm font-semibold leading-10 text-gray-600"
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
  );
};
