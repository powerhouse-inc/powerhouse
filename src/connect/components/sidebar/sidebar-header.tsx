import IconArrowLeft from '@/assets/icons/arrow-left.svg?react';
import { SidebarHeader, SidebarHeaderProps } from '@/powerhouse';
import { Button } from 'react-aria-components';

export interface ConnectSidebarHeaderProps extends SidebarHeaderProps {
    onToggle: () => void;
}

export const ConnectSidebarHeader: React.FC<ConnectSidebarHeaderProps> = ({
    onToggle,
    ...props
}) => {
    return (
        <SidebarHeader {...props}>
            <input
                placeholder="Create new document"
                className="flex-1 border border-neutral-3 rounded-md py-3 px-5 leading-none placeholder-shown:bg-transparent collapsed:hidden"
            />
            <Button
                className="border border-neutral-3 rounded-md p-3 collapsed:rotate-180"
                onPress={() => onToggle()}
            >
                <IconArrowLeft />
            </Button>
        </SidebarHeader>
    );
};
