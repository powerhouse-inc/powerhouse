import renownHover from '@/assets/renown-hover.png';
import renownShortHover from '@/assets/renown-short-hover.png';
import renownShort from '@/assets/renown-short.png';
import renown from '@/assets/renown.png';
export interface SidebarLoginProps {
    onLogin: () => void;
}

export const SidebarLogin: React.FC<SidebarLoginProps> = ({ onLogin }) => {
    return (
        <>
            {/* full-size version for expanded */}
            <button
                className="group/sidebar-footer hidden w-full cursor-pointer items-baseline justify-start text-sm font-semibold leading-10 text-gray-600 expanded:flex"
                onClick={onLogin}
            >
                <span>Login with</span>
                <img
                    src={renown}
                    className="ml-2 h-5 group-hover/sidebar-footer:hidden"
                />
                <img
                    src={renownHover}
                    className="ml-2 hidden h-5 group-hover/sidebar-footer:block"
                />
            </button>
            {/* small version for collapsed */}
            <button
                className="group/sidebar-footer hidden w-full cursor-pointer place-items-center p-1 collapsed:grid"
                onClick={onLogin}
                aria-label="Login with Renown"
            >
                <img
                    src={renownShort}
                    className="group-hover/sidebar-footer:hidden"
                />
                <img
                    src={renownShortHover}
                    className="hidden group-hover/sidebar-footer:block"
                />
            </button>
        </>
    );
};
