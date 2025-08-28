import ConnectLoaderVideo from "#assets/connect-loader.mp4";
import type { Size } from "@powerhousedao/design-system";
import { getDimensions } from "@powerhousedao/design-system";
import type { ComponentPropsWithoutRef, CSSProperties } from "react";

type Props = ComponentPropsWithoutRef<"video"> & {
  readonly size?: Size;
};
export function AnimatedLoader(props: Props) {
  const { style, size = 100, ...delegatedProps } = props;

  const dimensions = getDimensions(size);

  const _style: CSSProperties = {
    objectFit: "contain",
    pointerEvents: "none",
    ...dimensions,
    ...style,
  };

  const width = dimensions.width?.replace("px", "");
  const height = dimensions.height?.replace("px", "");

  return (
    <video
      autoPlay
      height={height}
      loop
      muted
      playsInline
      width={width}
      {...delegatedProps}
      style={_style}
    >
      <source src={ConnectLoaderVideo} type="video/mp4" />
    </video>
  );
}
