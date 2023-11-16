import ImgPowerhouse from '@/assets/powerhouse-rounded.png';

export interface SidebarUserProps {
    username: string;
    address: string;
}

export const SidebarUser: React.FC<SidebarUserProps> = ({
    username,
    address,
}) => (
    <div
        className={`flex gap-2 bg-white py-[10px] rounded-sm px-3 collapsing:bg-transparent
            collapsed:px-1 collapsed:justify-center collapsed:bg-transparent
            expanding:px-1 expanding:justify-center expanding:bg-transparent
        `}
    >
        <img
            src={ImgPowerhouse}
            alt={username}
            width={40}
            height={40}
            className="object-contain"
        />
        <div className="collapsed:hidden expanding:hidden">
            <p className="font-semibold text-sm text-[#404446]">{username}</p>
            <p className="font-semibold text-xs text-[#94A3B8]">{address}</p>
        </div>
    </div>
);
