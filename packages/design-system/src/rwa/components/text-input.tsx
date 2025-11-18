import type { ComponentPropsWithRef, ForwardedRef } from "react";
import { forwardRef } from "react";
import { twMerge } from "tailwind-merge";

type Props = Omit<ComponentPropsWithRef<"input">, "type"> & {
  readonly defaultValue?: string | number | null | undefined;
  readonly errorMessage?: string;
  readonly labelClassName?: string;
  readonly inputClassName?: string;
  readonly errorMessageClassName?: string;
};

export const RWATableTextInput = forwardRef(function RWATableTextInput(
  props: Props,
  ref: ForwardedRef<HTMLInputElement>,
) {
  const invalid = props["aria-invalid"] === "true";
  const {
    errorMessage,
    labelClassName,
    inputClassName,
    errorMessageClassName,
    ...inputProps
  } = props;

  return (
    <label className={labelClassName}>
      <input
        {...inputProps}
        className={twMerge(
          "h-8 w-full rounded-md border border-transparent bg-gray-100 p-3 text-right placeholder:text-gray-500 disabled:bg-transparent disabled:p-0 disabled:text-left",
          invalid && "border-red-900 outline-red-900 placeholder:text-red-800",
          inputClassName,
        )}
        ref={ref}
        type="text"
      />
      {invalid && !!errorMessage ? (
        <p
          className={twMerge("text-sm text-red-900", errorMessageClassName)}
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
    </label>
  );
});
