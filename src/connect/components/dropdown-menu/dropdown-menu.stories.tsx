import type { Meta, StoryObj } from '@storybook/react';
import { ConnectDropdownMenu } from './dropdown-menu';

import { Icon } from '@/powerhouse';
import { useState } from 'react';

const meta = {
    title: 'Connect/Components/Dropdown Menu',
    component: ConnectDropdownMenu,
} satisfies Meta<typeof ConnectDropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        onItemClick: () => {},
        children: null,
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
    render: function Wrapper(args) {
        const [open, setOpen] = useState(false);
        function toggleOpen() {
            setOpen(!open);
        }

        return (
            <ConnectDropdownMenu {...args} open={open} onOpenChange={setOpen}>
                <button onClick={toggleOpen}>Toggle</button>
            </ConnectDropdownMenu>
        );
    },
};
