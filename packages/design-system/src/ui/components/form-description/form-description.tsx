import { cn } from "#design-system";

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
        "font-sans text-sm/5 font-normal text-gray-600 dark:text-gray-500",
        className,
      )}
    >
      {children}
    </Component>
  );
};

export { FormDescription };
