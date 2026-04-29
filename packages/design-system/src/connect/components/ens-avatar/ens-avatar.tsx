import ImgPowerhouse from "#assets/powerhouse-rounded.png";
import type { CSSProperties } from "react";

type Props = {
  readonly address: `0x${string}`;
  readonly chainId?: number;
  readonly avatarUrl?: string;
  readonly size?: CSSProperties["width"];
};
export function ENSAvatar(props: Props) {
  const { avatarUrl = ImgPowerhouse, size = "14px" } = props;
  const style = {
    width: size,
    height: size,
  };

  return (
    <img
      alt="ENS Avatar"
      className="flex-none rounded-full object-contain"
      src={avatarUrl}
      style={style}
    />
  );
}
