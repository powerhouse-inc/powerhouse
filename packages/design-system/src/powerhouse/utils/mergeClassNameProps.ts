import { twMerge } from 'tailwind-merge';

type FunctionClassNameType = (values: any) => string;

interface ClassNameProps {
    className?: string | FunctionClassNameType;
}

export function mergeClassNameProps<T extends ClassNameProps>(
    props: T,
    className: string,
): { className?: string } & Omit<T, 'className'> {
    const { className: componentClassName, ...restProps } = props;

    return {
        className: twMerge(
            className,
            typeof componentClassName === 'string' && componentClassName,
        ),
        ...restProps,
    };
}
