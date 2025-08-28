import type { ComponentPropsWithRef, ForwardedRef } from "react";
import { forwardRef } from "react";
import { twJoin, twMerge } from "tailwind-merge";

type InputProps = ComponentPropsWithRef<"input">;
type FormInputProps = Omit<InputProps, "className"> & {
  readonly icon?: React.JSX.Element;
  readonly errorMessage?: string;
  readonly isTouched?: boolean;
  readonly isDirty?: boolean;
  readonly type?: "text" | "password" | "email" | "url";
  readonly inputClassName?: string;
  readonly containerClassName?: string;
  readonly errorMessageClassName?: string;
  readonly hideErrors?: boolean;
};
export const FormInput = forwardRef(function FormInput(
  props: FormInputProps,
  ref: ForwardedRef<HTMLInputElement>,
) {
  const {
    icon,
    errorMessage,
    isDirty,
    containerClassName,
    inputClassName,
    errorMessageClassName,
    hideErrors = false,
    ...delegatedProps
  } = props;
  const type = props.type ?? "text";
  const isError = !!errorMessage;
  return (
    <div>
      <div
        className={twMerge(
          "mb-1 flex gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-black placeholder:text-gray-50",
          isError && "border-red-900",
          containerClassName,
        )}
      >
        {icon && (
          <span className={twJoin((!isDirty || isError) && "text-slate-200")}>
            {icon}
          </span>
        )}

        <input
          {...delegatedProps}
          className={twMerge(
            "w-full bg-transparent font-semibold outline-none",
            inputClassName,
          )}
          ref={ref}
          type={type}
        />
      </div>
      <p
        className={twMerge(
          "hidden min-h-4 text-xs text-red-900",
          isError && "block",
          hideErrors && "hidden",
          errorMessageClassName,
        )}
      >
        {errorMessage}
      </p>
    </div>
  );
});
