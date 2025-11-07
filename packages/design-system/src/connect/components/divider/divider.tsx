import { twMerge } from "tailwind-merge";
import type { DivProps } from "../../../powerhouse/types/helpers.js";

export function Divider(props: DivProps) {
  return (
    <div {...props} className={twMerge("h-px bg-gray-200", props.className)} />
  );
}
