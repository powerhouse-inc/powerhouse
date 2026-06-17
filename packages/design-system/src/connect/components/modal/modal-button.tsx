import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";

const defaultStyle =
  "min-h-12 min-w-35.5 flex-1 transform place-items-center rounded-xl px-6 py-3 text-base font-semibold transition-all outline-none hover:hover-effect active:active-effect disabled:disabled-effect";

export function ModalButton(
  props: ComponentProps<"button"> & { variant: "confirm" | "cancel" },
) {
  const { variant, className, ...rest } = props;
  const confirmStyle = twMerge(
    defaultStyle,
    "bg-primary text-primary-foreground",
  );
  const cancelStyle = twMerge(defaultStyle, "bg-muted text-muted-foreground");
  const variantStyle = twMerge(
    variant === "confirm" ? confirmStyle : cancelStyle,
    className,
  );
  return <button className={variantStyle} {...rest} />;
}
