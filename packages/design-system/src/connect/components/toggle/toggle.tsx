import type { ComponentPropsWithRef, ForwardedRef } from "react";
import { forwardRef } from "react";

type ToggleProps = Omit<ComponentPropsWithRef<"input">, "type">;

export const Toggle = forwardRef(function Toggle(
  props: ToggleProps,
  ref: ForwardedRef<HTMLInputElement>,
) {
  return (
    <label className="relative cursor-pointer items-center" htmlFor={props.id}>
      <input
        className="peer sr-only"
        ref={ref}
        type="checkbox"
        value=""
        {...props}
      />
      <div className="peer h-6 w-11 rounded-full bg-muted-foreground peer-checked:bg-info peer-focus:outline-none after:absolute after:inset-s-0.5 after:top-0.5 after:size-5 after:rounded-full after:border after:border-none after:bg-background after:transition-all peer-checked:after:translate-x-full" />
    </label>
  );
});
