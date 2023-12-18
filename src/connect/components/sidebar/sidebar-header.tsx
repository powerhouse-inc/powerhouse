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
                className="flex-1 rounded-md border border-gray-100 px-5 py-3 leading-none text-gray-600 placeholder-shown:bg-transparent collapsed:hidden expanding:hidden"
            />
            <Button
                className={`rounded-md border border-gray-100 p-3 outline-none hover:bg-slate-50
                collapsed:rotate-180 collapsed:border-gray-100/10 collapsed:bg-gray-100
                collapsed:shadow-sidebar collapsed:hover:bg-slate-50
                expanding:hidden`}
                onPress={() => onToggle()}
            >
                <Icon name="arrow-left" size={16} className="text-gray-600" />
            </Button>
        </SidebarHeader>
    );
};
