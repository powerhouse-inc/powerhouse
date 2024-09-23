import * as RadixTooltip from '@radix-ui/react-tooltip';
import { ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

type Props = RadixTooltip.TooltipProps & {
    readonly className?: string;
    readonly content: ReactNode;
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
            defaultOpen={defaultOpen}
            delayDuration={0}
            onOpenChange={onOpenChange}
            open={open}
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
