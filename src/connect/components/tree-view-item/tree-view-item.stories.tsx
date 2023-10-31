import FilesIcon from '@/assets/icons/files-earmark-fill.svg';
import FolderIcon from '@/assets/icons/folder-plus-fill.svg';
import PencilIcon from '@/assets/icons/pencil-fill.svg';
import TrashIcon from '@/assets/icons/trash-fill.svg';
import type { Meta, StoryObj } from '@storybook/react';
import { ConnectTreeViewItem, ItemStatus, ItemType } from './tree-view-item';

const meta: Meta<typeof ConnectTreeViewItem> = {
    title: 'Connect/Components/TreeView',
    component: ConnectTreeViewItem,
    decorators: [
        Story => (
            <div className="bg-white p-10">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        onClick: { control: { type: 'action' } },
        onOptionsClick: { control: { type: 'action' } },
        buttonProps: { control: { type: 'object' } },
        level: { control: { type: 'number' } },
        item: { control: { type: 'object' } },
        defaultOptions: { control: { type: 'object' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const defaultOptions = [
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
];

export const TreeViewItem: Story = {
    args: {
        defaultOptions,
        level: 0,
        item: {
            id: 'drive/folder1',
            label: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua',
            type: ItemType.Folder,
            status: ItemStatus.Syncing,
            expanded: false,
            isSelected: false,
        },
    },
};
