import { type IconName, type Props } from "@/assets/icon-components/types";
import { type Color, getDimensions, type Size } from "#powerhouse";
import {
  type ComponentPropsWithoutRef,
  type ComponentType,
  type ElementType,
  lazy,
  Suspense,
  useMemo,
} from "react";

export { iconNames } from "@/assets/icon-components/types";
export type { IconName } from "@/assets/icon-components/types";

export type IconProps = ComponentPropsWithoutRef<"svg"> & {
  readonly name: IconName;
  readonly size?: Size;
  readonly color?: Color;
};

function IconErrorFallback(props: Props) {
  return <div style={{ width: props.width, height: props.height }} />;
}

function loadIcon(name: IconName): ElementType {
  try {
    return lazy<ComponentType<Props>>(
      () => import(`@/assets/icon-components/${name}.tsx`),
    );
  } catch (e) {
    console.error(e);
    return IconErrorFallback;
  }
}

export function preloadIcon(name: IconName) {
  return loadIcon(name);
}

export function Icon({ name, size = 24, color, style, ...props }: IconProps) {
  const dimensions = getDimensions(size);
  const _style = {
    color,
    ...dimensions,
    style,
  };

  const IconComponent = useMemo(() => loadIcon(name), [name]);

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
