import { cn } from "@/scalars/lib/utils";
import React from "react";

export interface FormDescriptionProps extends React.PropsWithChildren {
  as?: React.ElementType;
  className?: string;
}

const FormDescription: React.FC<FormDescriptionProps> = ({
  children,
  as,
  className,
}) => {
  const Component = as ?? "p";

  return (
    <Component
      className={cn(
        "font-inter text-sm font-normal leading-5 text-gray-600",
        className,
      )}
    >
      {children}
    </Component>
  );
};

export { FormDescription };
