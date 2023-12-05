import { DivProps } from '@/powerhouse';
import { twMerge } from 'tailwind-merge';

export function Divider(props: DivProps) {
    return (
        <div
            {...props}
            className={twMerge(
                'h-[1px] rounded-[1px] bg-grey-200',
                props.className,
            )}
        />
    );
}
