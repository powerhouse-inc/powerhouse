import type { Color, Size } from "#powerhouse";
import { getDimensions } from "#powerhouse";
import type { ComponentPropsWithoutRef } from "react";
import { Suspense } from "react";
import type { IconName } from "../icon-components/index.js";
import { iconComponents } from "../icon-components/index.js";

export type IconProps = ComponentPropsWithoutRef<"svg"> & {
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
