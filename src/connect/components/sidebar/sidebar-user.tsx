import ImgPowerhouse from '@/assets/icons/powerhouse-rounded.png';

export interface SidebarUserProps {
    username: string;
    address: string;
}

export const SidebarUser: React.FC<SidebarUserProps> = ({
    username,
    address,
}) => (
    <div className="flex gap-2 bg-white py-[10px] px-3 collapsed:px-1 collapsed:justify-center">
        <img
            src={ImgPowerhouse}
            alt={username}
            width={40}
            height={40}
            className="object-contain"
        />
        <div className="collapsed:hidden">
            <p className="font-semibold text-sm text-[#404446]">{username}</p>
            <p className="font-semibold text-xs text-[#94A3B8]">{address}</p>
        </div>
    </div>
);
