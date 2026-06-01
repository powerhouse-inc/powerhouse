import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";

const defaultStyle =
  "min-h-12 min-w-35.5 flex-1 transform place-items-center rounded-xl px-6 py-3 text-base font-semibold transition-all outline-none hover:scale-105 active:opacity-75 disabled:cursor-not-allowed disabled:hover:scale-none";

export function ModalButton(
  props: ComponentProps<"button"> & { variant: "confirm" | "cancel" },
) {
  const { variant, className, ...rest } = props;
  const confirmStyle = twMerge(
    defaultStyle,
    "bg-gray-800 text-gray-50 dark:bg-slate-100 dark:text-slate-900",
  );
  const cancelStyle = twMerge(
    defaultStyle,
    "bg-gray-400 text-gray-50 dark:bg-slate-400 dark:text-slate-900",
  );
  const variantStyle = twMerge(
    variant === "confirm" ? confirmStyle : cancelStyle,
    className,
  );
  return <button className={variantStyle} {...rest} />;
}
