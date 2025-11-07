import ConnectLoaderVideo from "@powerhousedao/design-system/assets/connect-loader.mp4";
import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import type { Size } from "../../../powerhouse/types/images.js";
import { getDimensions } from "../../../powerhouse/utils/getDimensions.js";

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
