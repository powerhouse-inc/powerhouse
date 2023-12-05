import { Icon, SidebarHeader, SidebarHeaderProps } from '@/powerhouse';
import { Button } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

export interface ConnectSidebarHeaderProps extends SidebarHeaderProps {
    onToggle: () => void;
}

export const ConnectSidebarHeader: React.FC<ConnectSidebarHeaderProps> = ({
    onToggle,
    className,
    ...props
}) => {
    return (
        <SidebarHeader
            {...props}
            className={twMerge(
                'mb-4 flex justify-center gap-4 px-2 pt-11',
                className,
            )}
        >
            <input
                placeholder="Create new document"
                className="flex-1 rounded-md border border-neutral-3 px-5 py-3 leading-none placeholder-shown:bg-transparent collapsed:hidden expanding:hidden"
            />
            <Button
                className={`rounded-md border border-neutral-3 p-3 outline-none hover:bg-slate-50
                collapsed:rotate-180 collapsed:border-[rgba(49,53,56,0.12)] collapsed:bg-neutral-3
                collapsed:shadow-[0px_33px_32px_-16px_rgba(0,0,0,0.10),0px_0px_16px_4px_rgba(0,0,0,0.04)] collapsed:hover:bg-slate-50
                expanding:hidden`}
                onPress={() => onToggle()}
            >
                <Icon name="arrow-left" size={16} color="#7C878E" />
            </Button>
        </SidebarHeader>
    );
};
