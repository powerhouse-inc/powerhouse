import type { Meta, StoryObj } from '@storybook/react';
import { ConnectDropdownMenu } from './dropdown-menu';

import { Icon } from '@/powerhouse';
import { useState } from 'react';

const meta = {
    title: 'Connect/Components/DropdownMenu',
    component: ConnectDropdownMenu,
    argTypes: {
        onItemClick: { action: 'onItemClick' },
        items: { control: { type: 'object' } },
        className: { control: { type: 'text' } },
        menuClassName: { control: { type: 'text' } },
        menuItemClassName: { control: { type: 'text' } },
    },
} satisfies Meta<typeof ConnectDropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: function ControlledWrapper(args) {
        const [isOpen, setIsOpen] = useState(false);
        function onOpenChange() {
            setIsOpen(!isOpen);
        }

        return (
            <div>
                <button onClick={onOpenChange}>Toggle</button>
                <ConnectDropdownMenu
                    {...args}
                    isOpen={isOpen}
                    onOpenChange={onOpenChange}
                />
            </div>
        );
    },
    args: {
        isOpen: false,
        onOpenChange: () => {},
        onItemClick: () => {},
        className:
            'bg-blue-500 text-white w-8 h-8 rounded justify-center items-center flex',
        menuClassName: 'bg-white cursor-pointer',
        menuItemClassName: 'hover:bg-slate-50 px-2',
        items: [
            {
                id: 'duplicate',
                label: 'Duplicate',
                icon: <Icon name="files-earmark" />,
            },
            {
                id: 'new-folder',
                label: 'New Folder',
                icon: <Icon name="folder-plus" />,
            },
            {
                id: 'rename',
                label: 'Rename',
                icon: <Icon name="pencil" />,
            },
            {
                id: 'delete',
                label: 'Delete',
                icon: <Icon name="trash" />,
                className: 'text-red-900',
            },
        ],
    },
};
