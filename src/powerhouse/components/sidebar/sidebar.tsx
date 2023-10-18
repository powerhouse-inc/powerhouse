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

export const Sidebar: React.FC<SidebarProps> = ({
    collapsed = false,
    maxWidth = '304px',
    minWidth = '80px',
    className,
    children,
    ...props
}) => {
    return (
        <div
            {...props}
            className={twMerge(
                'group group/sidebar flex flex-col h-full bg-neutral-1 overflow-hidden',
                className,
                collapsed && 'collapsed',
            )}
            style={{
                width: collapsed ? minWidth : maxWidth,
            }}
        >
            {children}
        </div>
    );
};
