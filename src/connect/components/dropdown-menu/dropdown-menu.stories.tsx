import type { Meta, StoryObj } from '@storybook/react';
import { ConnectDropdownMenu } from './dropdown-menu';

import FilesIcon from '@/assets/icons/files-earmark-fill.svg';
import FolderIcon from '@/assets/icons/folder-plus-fill.svg';
import PencilIcon from '@/assets/icons/pencil-fill.svg';
import TrashIcon from '@/assets/icons/trash-fill.svg';

const meta = {
    title: 'Connect/Components/DropdownMenu',
    component: ConnectDropdownMenu,
    argTypes: {
        onItemClick: { action: 'onItemClick' },
        children: { control: { type: 'text' } },
        items: { control: { type: 'object' } },
        className: { control: { type: 'text' } },
        menuClassName: { control: { type: 'text' } },
        menuItemClassName: { control: { type: 'text' } },
    },
} satisfies Meta<typeof ConnectDropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        className:
            'bg-blue-500 text-white w-8 h-8 rounded justify-center items-center flex',
        menuClassName: 'bg-white cursor-pointer',
        menuItemClassName: 'hover:bg-[#F1F5F9] px-2',
        children: '☰',
        items: [
            {
                id: 'duplicate',
                label: 'Duplicate',
                icon: FilesIcon,
            },
            {
                id: 'new-folder',
                label: 'New Folder',
                icon: FolderIcon,
            },
            {
                id: 'rename',
                label: 'Rename',
                icon: PencilIcon,
            },
            {
                id: 'delete',
                label: 'Delete',
                icon: TrashIcon,
                className: 'text-[#EA4335]',
            },
        ],
    },
};
