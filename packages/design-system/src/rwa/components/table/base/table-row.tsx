import { type ComponentPropsWithRef, forwardRef } from "react";
import { twMerge } from "tailwind-merge";

export type RWATableRowProps = ComponentPropsWithRef<"tr">;

export const RWATableRow = forwardRef(function RWATableRow(
  props: RWATableRowProps,
  ref: React.Ref<HTMLTableRowElement>,
) {
  const { children, className, ...delegated } = props;

  return (
    <tr
      {...delegated}
      className={twMerge("odd:bg-white even:bg-gray-50", className)}
      ref={ref}
    >
      {children}
    </tr>
  );
});
