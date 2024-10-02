import { useAnimation } from '@/powerhouse';
import { useEffect, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';

export interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
    collapsed: boolean;
    maxWidth: string;
    minWidth: string;
}

export type SidebarHeaderProps = React.HTMLAttributes<HTMLDivElement>;

export function SidebarHeader({ className, ...props }: SidebarHeaderProps) {
    return <div className={twMerge('shrink-0', className)} {...props} />;
}

export type SidebarFooterProps = React.HTMLAttributes<HTMLDivElement>;

export function SidebarFooter({ className, ...props }: SidebarFooterProps) {
    return <div className={twMerge('shrink-0', className)} {...props} />;
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
            className={twMerge(
                ` group ${state} flex
                 h-full flex-col overflow-hidden transition-none duration-300`,
                className,
                ['collapsing', 'expanding'].includes(state) &&
                    'animate-out fade-out',
                ['collapsed', 'expanded'].includes(state) &&
                    'animate-in fade-in',
                state === 'collapsed' && 'bg-transparent shadow-none',
                state === 'expanded' && 'shadow-sidebar',
            )}
            ref={ref}
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
