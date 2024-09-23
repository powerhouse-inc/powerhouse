import { DivProps, Icon } from '@/powerhouse';
import { ReactNode } from 'react';
import { twJoin, twMerge } from 'tailwind-merge';

type DisclosureProps = DivProps & {
    readonly title: ReactNode;
    readonly isOpen: boolean;
    readonly onOpenChange: () => void;
};
export function Disclosure(props: DisclosureProps) {
    const { title, isOpen, onOpenChange, children, className, ...divProps } =
        props;
    return (
        <div {...divProps}>
            <div
                className="flex cursor-pointer justify-between text-gray-500"
                onClick={onOpenChange}
            >
                <h2 className=" font-semibold text-gray-500">{title}</h2>
                <Icon
                    className={twJoin('transition', isOpen ? '' : '-rotate-90')}
                    name="ChevronDown"
                />
            </div>
            <div
                className={twMerge(
                    'max-h-0 overflow-hidden transition-[max-height] duration-300 ease-in-out',
                    isOpen && 'max-h-screen',
                    className,
                )}
            >
                {children}
            </div>
        </div>
    );
}
