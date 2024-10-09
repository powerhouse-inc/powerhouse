import { ComponentPropsWithRef, Ref, forwardRef } from "react";
import { twMerge } from "tailwind-merge";

export type DateTimeLocalInputProps = Omit<
  ComponentPropsWithRef<"input">,
  "type"
> & {
  readonly inputType?: "datetime-local" | "date";
};

export const DateTimeLocalInput = forwardRef(function DateTimeLocalInput(
  props: DateTimeLocalInputProps,
  ref: Ref<HTMLInputElement>,
) {
  const { inputType = "datetime-local", ...inputProps } = props;

  return (
    <input
      {...inputProps}
      className={twMerge(
        "h-8 w-full rounded-md bg-gray-100 px-3 disabled:bg-transparent disabled:p-0",
        props.className,
      )}
      ref={ref}
      step={props.step ?? "1"}
      type={inputType}
    />
  );
});
