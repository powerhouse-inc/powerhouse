import { twMerge } from "tailwind-merge";
import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { forwardRef } from "react";

const buttonVariants = cva(
  twMerge(
    "inline-flex items-center justify-center gap-2",
    "rounded-md text-sm font-medium whitespace-nowrap",
    "transition-colors",
    "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    "disabled:disabled-effect",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ),
  {
    variants: {
      variant: {
        default: "",
        outline: "border",
        ghost: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={twMerge(buttonVariants({ variant, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);

export { Button, buttonVariants };
