import { ComponentPropsWithoutRef } from 'react';
import { twMerge } from 'tailwind-merge';

export function Divider(props: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            {...props}
            className={twMerge(
                'h-[1px] rounded-[1px] bg-[#EFEFEF]',
                props.className,
            )}
        />
    );
}
