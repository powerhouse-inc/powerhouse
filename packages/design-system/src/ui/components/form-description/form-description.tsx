import { twMerge } from "tailwind-merge";

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
      className={twMerge(
        "font-sans text-sm/5 font-normal text-gray-600 dark:text-slate-300",
        className,
      )}
    >
      {children}
    </Component>
  );
};

export { FormDescription };
