import type { ComponentPropsWithRef, ForwardedRef } from "react";
import { forwardRef } from "react";
import { twJoin, twMerge } from "tailwind-merge";

export type PowerhouseButtonProps = ComponentPropsWithRef<"button"> & {
  readonly color?: "light" | "dark" | "red" | "blue";
  readonly size?: "small" | "medium";
  readonly icon?: React.JSX.Element;
  readonly iconPosition?: "left" | "right";
};

export const PowerhouseButton = forwardRef(function PowerhouseButton(
  props: PowerhouseButtonProps,
  ref: ForwardedRef<HTMLButtonElement>,
) {
  const {
    color = "dark",
    size = "medium",
    className = "",
    children,
    icon,
    iconPosition = "left",
    ...delegatedProps
  } = props;

  const sizeStyles = {
    small: "px-2 py-1.5 text-xs rounded-md font-medium",
    medium: "px-6 py-3 text-base rounded-xl font-semibold tracking-wide",
  };

  const colorStyles = {
    light:
      "bg-secondary text-foreground hover:hover-effect active:active-effect disabled:disabled-effect",
    dark: "bg-primary text-primary-foreground hover:hover-effect active:active-effect disabled:disabled-effect",
    red: "bg-destructive text-destructive-foreground hover:hover-effect active:active-effect disabled:disabled-effect disabled:opacity-100",
    blue: "bg-info text-info-foreground hover:hover-effect active:active-effect disabled:disabled-effect disabled:opacity-100",
  };

  const colorAndSizeStyle = twJoin(colorStyles[color], sizeStyles[size]);

  const finalClassName = twMerge(
    "flex items-center justify-center gap-2 border border-none transition outline-none disabled:disabled-effect",
    colorAndSizeStyle,
    className,
  );

  return (
    <button className={finalClassName} ref={ref} {...delegatedProps}>
      {iconPosition === "left" && icon}
      {children}
      {iconPosition === "right" && icon}
    </button>
  );
});
