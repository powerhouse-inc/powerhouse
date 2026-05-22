import { mergeClassNameProps } from "#design-system";

export const Footer: React.FC<React.HTMLAttributes<HTMLElement>> = ({
  children,
  ...props
}) => {
  return (
    <footer
      {...mergeClassNameProps(
        props,
        "flex items-center gap-x-6 text-xs font-medium text-charcoal-300 dark:text-slate-600",
      )}
    >
      {children}
    </footer>
  );
};
