import { useAnimation } from '@/powerhouse/hooks/animation';
import { useEffect, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';

export interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
    collapsed: boolean;
    maxWidth: string;
    minWidth: string;
}

export interface SidebarHeaderProps
    extends React.HTMLAttributes<HTMLDivElement> {}

export function SidebarHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={twMerge('flex-shrink-0', className)} {...props} />;
}

export interface SidebarFooterProps
    extends React.HTMLAttributes<HTMLDivElement> {}

export function SidebarFooter({ className, ...props }: SidebarFooterProps) {
    return <div className={twMerge('flex-shrink-0', className)} {...props} />;
}

type AnimationState = 'collapsed' | 'expanded' | 'collapsing' | 'expanding';

export const Sidebar: React.FC<SidebarProps> = ({
    collapsed = false,
    maxWidth = '304px',
    minWidth = '80px',
    className,
    children,
    ...props
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const [state, setState] = useState<AnimationState>(
        collapsed ? 'collapsed' : 'expanded',
    );

    useAnimation(ref, ['collapsing', 'expanding'].includes(state), () => {
        setState(currentState =>
            currentState === 'collapsing'
                ? 'collapsed'
                : currentState === 'expanding'
                ? 'expanded'
                : currentState,
        );
    });

    useEffect(() => {
        if (collapsed && state !== 'collapsed') {
            setState('collapsing');
        } else if (!collapsed && state !== 'expanded') {
            setState('expanding');
        }
    }, [collapsed]);

    return (
        <div
            {...props}
            ref={ref}
            className={twMerge(
                `group group/sidebar ${state} duration-300
                 flex flex-col h-full overflow-hidden transition-none`,
                className,
                ['collapsing', 'expanding'].includes(state) &&
                    'animate-out fade-out',
                ['collapsed', 'expanded'].includes(state) &&
                    'animate-in fade-in',
                state === 'collapsed' && 'bg-transparent shadow-none',
                state === 'expanded' &&
                    'bg-neutral-1 shadow-[0px_33px_32px_-16px_rgba(0,0,0,0.10),0px_0px_16px_4px_rgba(0,0,0,0.04)]',
            )}
            style={{
                width: ['collapsed', 'expanding'].includes(state)
                    ? minWidth
                    : maxWidth,
            }}
        >
            {children}
        </div>
    );
};
