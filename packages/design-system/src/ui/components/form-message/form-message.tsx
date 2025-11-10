import { cn } from "@powerhousedao/design-system";

export type FormMessageType = "error" | "info" | "warning";

type FormMessageOwnProps<E extends React.ElementType = React.ElementType> = {
  type?: FormMessageType;
  as?: E;
  className?: string;
};

export type FormMessageProps<E extends React.ElementType> =
  FormMessageOwnProps<E> &
    Omit<React.ComponentPropsWithoutRef<E>, keyof FormMessageOwnProps>;

const defaultElement = "p";

export const FormMessage: <E extends React.ElementType = typeof defaultElement>(
  props: FormMessageProps<E>,
) => React.ReactElement | null = ({
  children,
  type = "info",
  as,
  className,
  ...props
}) => {
  const Component = as || defaultElement;

  const typeClasses: Record<FormMessageType, string> = {
    error: "text-red-900 dark:text-red-900",
    info: "text-blue-900 dark:text-blue-900",
    warning: "text-yellow-900 dark:text-yellow-900",
  };

  const classes = cn(
    "mb-0 inline-flex items-center text-xs font-medium",
    typeClasses[type],
    className,
  );

  // TODO: add icon
  return (
    <Component data-type={type} className={classes} {...props}>
      {children}
    </Component>
  );
};
