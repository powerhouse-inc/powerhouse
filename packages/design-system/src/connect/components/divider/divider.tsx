import type { DivProps } from "@powerhousedao/design-system";
import { twMerge } from "tailwind-merge";

export function Divider(props: DivProps) {
  return (
    <div {...props} className={twMerge("h-px bg-gray-200", props.className)} />
  );
}
