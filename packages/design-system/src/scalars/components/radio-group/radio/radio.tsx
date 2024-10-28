import React, { useId } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";
import { FormLabel } from "@/scalars/components/form-label";
import { cn } from "@/scalars/lib/utils";

export interface RadioProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> {
  className?: string;
  description?: string;
  hasError?: boolean;
  id?: string;
  label: string;
  readOnly?: boolean;
  value: string;
}

export const Radio = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioProps
>(
  (
    {
      className,
      description,
      hasError,
      id: propId,
      label,
      readOnly,
      value,
      ...props
    },
    ref,
  ) => {
    const prefix = useId();
    const id = propId ?? `${prefix}-radio`;

    return (
      <div className="flex items-center space-x-2.5" role="presentation">
        <RadioGroupPrimitive.Item
          {...props}
          aria-disabled={readOnly}
          aria-invalid={hasError}
          aria-readonly={readOnly}
          className={cn(
            "aspect-square size-4 rounded-full border-2 border-blue-700",
            "focus:outline-none focus:ring-2 focus:ring-blue-100 focus:ring-offset-0",
            "hover:border-blue-900",
            "focus:hover:ring-blue-200",
            readOnly &&
              "border-gray-600 cursor-not-allowed opacity-50 hover:border-gray-600",
            hasError &&
              "border-red-700 focus:ring-red-100 hover:border-red-900 focus:hover:ring-red-200",
            className,
          )}
          disabled={readOnly}
          id={id}
          ref={ref}
          value={value}
        >
          <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
            <Circle
              className={cn(
                "size-2.5",
                "fill-blue-700 text-blue-700",
                "hover:fill-blue-900 hover:text-blue-900",
                readOnly &&
                  "fill-gray-600 text-gray-600 hover:fill-gray-600 hover:text-gray-600",
                hasError &&
                  "fill-red-700 text-red-700 hover:fill-red-900 hover:text-red-900",
              )}
            />
          </RadioGroupPrimitive.Indicator>
        </RadioGroupPrimitive.Item>
        <FormLabel
          description={description}
          disabled={readOnly}
          hasError={hasError}
          htmlFor={id}
          required={props.required}
        >
          {label}
        </FormLabel>
      </div>
    );
  },
);
