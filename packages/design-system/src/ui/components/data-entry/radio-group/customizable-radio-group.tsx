import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import React, { useId } from "react";

interface CustomizableRadioGroupProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  children: React.ReactNode;
  className?: string;
  id?: string;
  name?: string;
}

const CustomizableRadioGroup = React.forwardRef<
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

CustomizableRadioGroup.displayName = "CustomizableRadioGroup";

export { CustomizableRadioGroup, type CustomizableRadioGroupProps };
