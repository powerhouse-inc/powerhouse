import ImgPowerhouse from "@/assets/powerhouse-rounded.png";
import { CSSProperties } from "react";
import { useEnsAvatar, useEnsName } from "wagmi";

type Props = {
  readonly address: `0x${string}`;
  readonly chainId?: number;
  readonly size?: CSSProperties["width"];
};
export function ENSAvatar(props: Props) {
  const { address, chainId = 1, size = "14px" } = props;
  const style = {
    width: size,
    height: size,
  };
  const ensNameResult = useEnsName({ address, chainId });
  const name = ensNameResult.data ?? undefined;
  const ensAvatarResult = useEnsAvatar({ name });
  const avatarUrl = ensAvatarResult.data ?? ImgPowerhouse;
  const isLoading = ensNameResult.isLoading || ensAvatarResult.isLoading;

  if (isLoading)
    return (
      <div
        className="fade-out flex-none animate-pulse rounded-full bg-gray-400"
        style={style}
      />
    );

  return (
    <img
      alt="ENS Avatar"
      className="flex-none rounded-full object-contain"
      src={avatarUrl}
      style={style}
    />
  );
}
