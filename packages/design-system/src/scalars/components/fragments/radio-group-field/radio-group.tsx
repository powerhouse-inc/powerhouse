import React, { useId } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

export interface CustomizableRadioGroupProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  children: React.ReactNode;
  className?: string;
  id?: string;
  name?: string;
}

export const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  CustomizableRadioGroupProps
>(({ children, className, id: propId, name, ...props }, ref) => {
  const prefix = useId();
  const id = propId ?? `${prefix}-radio-group`;

  return (
    <RadioGroupPrimitive.Root
      className={className}
      id={id}
      name={name}
      {...props}
      ref={ref}
    >
      {children}
    </RadioGroupPrimitive.Root>
  );
});

RadioGroup.displayName = "RadioGroup";
