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
                'group group/sidebar flex flex-col h-full bg-neutral-1 overflow-hidden shadow-[0px_33px_32px_-16px_rgba(0,0,0,0.10),0px_0px_16px_4px_rgba(0,0,0,0.04)]',
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
