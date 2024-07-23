import * as RadixTooltip from '@radix-ui/react-tooltip';
import { ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

type Props = RadixTooltip.TooltipProps & {
    className?: string;
    content: ReactNode;
};

export function Tooltip(props: Props) {
    const {
        children,
        content,
        open,
        defaultOpen,
        onOpenChange,
        className,
        ...rest
    } = props;

    return (
        <RadixTooltip.Root
            open={open}
            defaultOpen={defaultOpen}
            onOpenChange={onOpenChange}
            delayDuration={0}
        >
            <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
            <RadixTooltip.Portal>
                <RadixTooltip.Content
                    {...rest}
                    className={twMerge(
                        'rounded-lg border border-gray-200 bg-white p-2 text-xs shadow-tooltip',
                        className,
                    )}
                >
                    {content}
                </RadixTooltip.Content>
            </RadixTooltip.Portal>
        </RadixTooltip.Root>
    );
}

export const TooltipProvider = RadixTooltip.Provider;
