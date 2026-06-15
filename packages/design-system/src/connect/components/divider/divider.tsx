import type { DivProps } from "#design-system";
import { twMerge } from "tailwind-merge";

export function Divider(props: DivProps) {
  return (
    <div {...props} className={twMerge("h-px bg-secondary", props.className)} />
  );
}
