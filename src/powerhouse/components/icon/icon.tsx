import { ComponentProps } from 'react';

export type IconProps = ComponentProps<'svg'> & {
    name: string;
};

export function Icon({ name, ...props }: IconProps) {
    return (
        <svg {...props}>
            <use href={`/icons.svg#${name}`} />
        </svg>
    );
}
