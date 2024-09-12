import { mergeClassNameProps } from '@/powerhouse';

type FooterLinkProps<E extends React.ElementType> = {
    as?: E;
} & React.ComponentPropsWithRef<E>;

export const FooterLink = <E extends React.ElementType = 'a'>(
    props: FooterLinkProps<E>,
) => {
    const { as: Component = 'a', ...restProps } = props;

    return (
        <Component
            {...mergeClassNameProps(
                restProps,
                'flex cursor-pointer items-center hover:underline',
            )}
        />
    );
};
