import { Icon } from '@/powerhouse';

export interface SidebarLoginProps {
    onLogin: () => void;
}

export const SidebarLogin: React.FC<SidebarLoginProps> = ({ onLogin }) => {
    return (
        <button
            className="flex items-baseline gap-2 px-5 py-2.5 text-sm font-semibold leading-10 text-gray-600"
            onClick={onLogin}
        >
            <span>Login with</span>
            <span className="h-[19px]">
                <Icon name="renown" className="!h-5 !w-[71px] text-gray-500" />
            </span>
        </button>
    );
};
