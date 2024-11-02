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
        "text-gray-600 font-inter text-sm font-normal leading-5",
        className,
      )}
    >
      {children}
    </Component>
  );
};

export { FormDescription };
