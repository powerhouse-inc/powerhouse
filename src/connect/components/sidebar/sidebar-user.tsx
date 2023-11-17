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
        className={`flex gap-2 rounded-sm bg-white px-3 py-[10px] collapsed:justify-center
            collapsed:bg-transparent collapsed:px-1 collapsing:bg-transparent
            expanding:justify-center expanding:bg-transparent expanding:px-1
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
            <p className="text-sm font-semibold text-[#404446]">{username}</p>
            <p className="text-xs font-semibold text-[#94A3B8]">{address}</p>
        </div>
    </div>
);
