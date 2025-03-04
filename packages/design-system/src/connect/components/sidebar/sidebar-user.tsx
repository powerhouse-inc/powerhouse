import { ENSAvatar } from "@/connect";

export interface SidebarUserProps {
  address: `0x${string}`;
}

export const SidebarUser: React.FC<SidebarUserProps> = ({ address }) => {
  return (
    <div className="flex items-center justify-center rounded-sm">
      <ENSAvatar address={address} size="40px" />
    </div>
  );
};
