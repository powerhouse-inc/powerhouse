import { mergeClassNameProps } from "#powerhouse";

type FooterLinkProps<E extends React.ElementType> = {
  readonly as?: E;
} & React.ComponentPropsWithRef<E>;

export function FooterLink<E extends React.ElementType = "a">(
  props: FooterLinkProps<E>,
) {
  const { as: Component = "a", ...restProps } = props;

  return (
    <Component
      {...mergeClassNameProps(
        restProps,
        "flex cursor-pointer items-center hover:underline",
      )}
    />
  );
}
