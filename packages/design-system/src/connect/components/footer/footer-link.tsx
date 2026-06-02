import { twMerge } from "tailwind-merge";

type FooterLinkProps<E extends React.ElementType> = {
  readonly as?: E;
} & React.ComponentPropsWithRef<E>;

export function FooterLink<E extends React.ElementType = "a">(
  props: FooterLinkProps<E>,
) {
  const { as: Component = "a", className, ...restProps } = props;

  return (
    <Component
      className={twMerge(
        "flex cursor-pointer items-center hover:underline",
        typeof className === "string" && className,
      )}
      {...restProps}
    />
  );
}
