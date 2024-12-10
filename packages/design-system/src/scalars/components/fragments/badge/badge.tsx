import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/scalars/lib/utils";

const badgeVariants = cva(
  cn(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
    "transition-colors focus:outline-none",
  ),
  {
    variants: {
      variant: {
        default: "border-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge: React.FC<BadgeProps> = ({ variant, className, ...props }) => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
);

export { Badge, badgeVariants };
