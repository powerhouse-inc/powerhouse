import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/scalars/lib/utils";

interface ToggleProps {
  disabled?: boolean;
  checked?: boolean;
  required?: boolean;
  onChange?: (checked: boolean) => void;
}

const Toggle = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & ToggleProps
>(
  (
    {
      className,
      disabled = false,
      checked = true,
      required = false,
      onChange = () => {},
      ...props
    },
    ref,
  ) => (
    <SwitchPrimitives.Root
      required={required}
      checked={checked}
      role="switch"
      disabled={disabled}
      onCheckedChange={onChange}
      className={cn(
        "focus-visible:ring-ring focus-visible:ring-offset-background peer inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 data-[state=checked]:bg-[#343839] data-[state=unchecked]:bg-[#D7D8D9] dark:data-[state=checked]:bg-[#3BBE5F] dark:data-[state=unchecked]:bg-[#404446]",
        disabled &&
          "cursor-not-allowed data-[state=checked]:bg-[#C5C7C7] data-[state=unchecked]:bg-[#EFEFEF] dark:data-[state=checked]:bg-[#404446] dark:data-[state=unchecked]:bg-[#343839]",
        className,
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "peer pointer-events-none block size-3.5 rounded-full bg-[#FCFCFC] shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-3.5 data-[state=unchecked]:translate-x-0",
          disabled &&
            "bg-[#FCFCFC] disabled:cursor-not-allowed dark:bg-[#6C7275]",
        )}
      />
    </SwitchPrimitives.Root>
  ),
);

export { Toggle };
