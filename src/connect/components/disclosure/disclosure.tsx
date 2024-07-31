import { DivProps, Icon } from '@/powerhouse';
import { ReactNode } from 'react';
import { twJoin, twMerge } from 'tailwind-merge';

type DisclosureProps = DivProps & {
    title: ReactNode;
    isOpen: boolean;
    onOpenChange: () => void;
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
                    name="ChevronDown"
                    className={twJoin('transition', isOpen ? '' : '-rotate-90')}
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
