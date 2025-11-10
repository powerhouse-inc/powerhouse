import { mergeClassNameProps } from "@powerhousedao/design-system";

export const Footer: React.FC<React.HTMLAttributes<HTMLElement>> = ({
  children,
  ...props
}) => {
  return (
    <footer
      {...mergeClassNameProps(
        props,
        "flex items-center gap-x-6 text-xs font-medium text-[#9DA6B9]",
      )}
    >
      {children}
    </footer>
  );
};
