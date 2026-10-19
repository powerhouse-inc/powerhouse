import type { Color, IconComponentProps, IconName, Size } from "#design-system";
import { Suspense } from "react";
import { getDimensions } from "../../utils/getDimensions.js";
import { IconByName } from "./icon-by-name.js";
type IconProps = IconComponentProps & {
  readonly name: IconName;
  readonly size?: Size;
  readonly color?: Color;
};
export function Icon({ name, size = 24, color, style, ...props }: IconProps) {
  const dimensions = getDimensions(size);
  const _style = {
    color,
    ...dimensions,
    style,
  };

  return (
    // displays div with the same size while icon
    // loads to avoid UI displacement
    <Suspense
      fallback={<div data-testid="icon-fallback" style={dimensions} />}
      name="icon-component"
    >
      <IconByName name={name} {...props} style={_style} />
    </Suspense>
  );
}
