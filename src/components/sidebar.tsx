import {
    Children,
    isValidElement,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { twMerge } from 'tailwind-merge';

export interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
    collapsed: boolean;
    maxWidth: string;
    minWidth: string;
}

export function SidebarHeader(props: React.HTMLAttributes<HTMLDivElement>) {
    return <div {...props} />;
}

export function SidebarFooter(props: React.HTMLAttributes<HTMLDivElement>) {
    return <div {...props} />;
}

export const Sidebar: React.FC<SidebarProps> = ({
    collapsed = false,
    maxWidth,
    minWidth,
    className,
    children,
    ...props
}) => {
    // checks children to retrieve header and footer components
    const { header, footer, content } = useMemo(() => {
        let header, footer;
        const content: React.ReactElement[] = [];
        Children.forEach(children, child => {
            if (!isValidElement(child)) return;
            if (child.type === SidebarHeader) {
                header = child;
            } else if (child.type === SidebarFooter) {
                footer = child;
            } else {
                content.push(child);
            }
        });
        return { header, footer, content };
    }, [children]);

    const [hasScroll, setHasScroll] = useState(false);

    function checkContentScroll(target: Element) {
        setHasScroll(
            target.scrollHeight - target.scrollTop - target.clientHeight > 1,
        );
    }

    const containerRef = useRef<HTMLDivElement>(null);

    // listen for resize events to update shadow
    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

        const observer = new ResizeObserver(
            (entries: ResizeObserverEntry[]) => {
                const entry = entries.pop();
                if (!entry) {
                    return;
                }

                const { target } = entry;
                checkContentScroll(target);
            },
        );
        observer.observe(containerRef.current);
        return () => {
            observer.disconnect();
        };
    }, [containerRef.current]);

    return (
        <div
            {...props}
            className={twMerge(
                'group group/sidebar flex flex-col h-full bg-neutral-1 overflow-hidden',
                className,
                collapsed && 'collapsed',
            )}
            style={{ width: collapsed ? minWidth : maxWidth }}
        >
            <div
                className="flex-1 overflow-auto no-scrollbar transition-shadow"
                style={{
                    boxShadow: hasScroll
                        ? 'inset 0px -33px 32px -16px rgba(0,0,0,0.1)'
                        : 'none',
                }}
                ref={containerRef}
                onScroll={e => checkContentScroll(e.currentTarget)}
            >
                {header && <div className="flex-shrink-0 mb-3">{header}</div>}
                <div data-sidebar="content">{content}</div>
            </div>
            {footer && <div className="flex-shrink-0">{footer}</div>}
        </div>
    );
};
