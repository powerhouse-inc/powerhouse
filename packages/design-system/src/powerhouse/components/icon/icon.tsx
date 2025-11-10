import type {
  Color,
  IconComponentProps,
  IconName,
  Size,
} from "@powerhousedao/design-system";
import { Suspense } from "react";
import { getDimensions } from "../../utils/getDimensions.js";
import { iconComponents } from "../icon-components/index.js";

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

  const IconComponent = iconComponents[name];

  return (
    // displays div with the same size while icon
    // loads to avoid UI displacement
    <Suspense
      fallback={<div data-testid="icon-fallback" style={dimensions} />}
      name="icon-component"
    >
      <IconComponent {...props} style={_style} />
    </Suspense>
  );
}
