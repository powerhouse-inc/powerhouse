import React, { useId } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "@/scalars/lib/utils";

export interface RadioGroupProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  children: React.ReactNode;
  className?: string;
  id?: string;
  name?: string;
}

export const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  RadioGroupProps
>(({ children, className, id: propId, name: propName, ...props }, ref) => {
  const prefix = useId();
  const id = propId ?? `${prefix}-radio-group`;
  const name = propName ?? `${prefix}-radio-group`;

  return (
    <RadioGroupPrimitive.Root
      className={cn("flex flex-col gap-2.5", className)}
      id={id}
      name={name}
      ref={ref}
      {...props}
    >
      {children}
    </RadioGroupPrimitive.Root>
  );
});
