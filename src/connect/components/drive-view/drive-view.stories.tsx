import FilesIcon from '@/assets/icons/files-earmark-fill.svg';
import FolderIcon from '@/assets/icons/folder-plus-fill.svg';
import PencilIcon from '@/assets/icons/pencil-fill.svg';
import TrashIcon from '@/assets/icons/trash-fill.svg';
import type { Meta, StoryObj } from '@storybook/react';
import { ItemStatus, ItemType } from '../tree-view-item';
import { DriveView } from './drive-view';

const meta: Meta<typeof DriveView> = {
    title: 'Connect/Components/DriveView',
    component: DriveView,
    parameters: {
        layout: 'centered',
    },
    decorators: [
        Story => (
            <div className="bg-neutral-1 p-10 w-[312px] to-neutral-1">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        type: {
            control: {
                type: 'select',
            },
            options: ['public', 'local', 'cloud'],
        },
        name: { control: { type: 'string' } },
        drives: { control: { type: 'object' } },
        onItemClick: { control: { type: 'action' } },
        onDropEvent: { control: { type: 'action' } },
        onItemOptionsClick: { control: { type: 'action' } },
        defaultItemOptions: { control: { type: 'object' } },
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

const items = [
    {
        id: 'drive/folder1',
        label: 'Folder 1',
        type: ItemType.Folder,
        status: ItemStatus.Syncing,
        expanded: false,
        children: [
            {
                id: 'drive/folder1/folder1.1',
                label: 'Folder 1.1',
                type: ItemType.Folder,
                status: ItemStatus.Syncing,
                expanded: false,
            },
            {
                id: 'drive/folder1/folder1.2',
                label: 'Folder 1.2',
                type: ItemType.Folder,
                status: ItemStatus.Syncing,
                expanded: false,
                children: [
                    {
                        id: 'drive/folder1/folder1.2/folder1.2.1',
                        label: 'Folder 1.2.1',
                        type: ItemType.Folder,
                        status: ItemStatus.Syncing,
                        expanded: false,
                    },
                ],
            },
        ],
    },
    {
        id: 'drive/folder2',
        label: 'Folder 2',
        type: ItemType.Folder,
        status: ItemStatus.AvailableOffline,
        expanded: false,
        children: [
            {
                id: 'drive/folder2/folder2.1',
                label: 'Folder 2.1',
                type: ItemType.Folder,
                status: ItemStatus.AvailableOffline,
                expanded: false,
            },
        ],
    },
    {
        id: 'drive/folder3',
        label: 'Folder 3',
        type: ItemType.Folder,
        status: ItemStatus.Offline,
        expanded: false,
    },
];

export const Public: Story = {
    args: {
        drives: [
            {
                id: 'drive',
                label: 'MakerDAO Atlas',
                type: ItemType.PublicDrive,
                expanded: true,
                children: items,
            },
        ],
        name: 'Public drives',
        type: 'public',
        defaultItemOptions: defaultOptions,
    },
};

export const Cloud: Story = {
    args: {
        drives: [
            {
                id: 'cloud',
                label: 'Powerhouse Team Drive',
                type: ItemType.NetworkDrive,
                expanded: false,
                children: items,
            },
            {
                id: 'cloud',
                label: 'Powerhouse Team Drive',
                type: ItemType.NetworkDrive,
                expanded: true,
                children: items,
            },
        ],
        name: 'Secure Cloud Storage',
        type: 'cloud',
        defaultItemOptions: defaultOptions,
    },
};

export const Local: Story = {
    args: {
        drives: [
            {
                id: 'local',
                label: 'Local Device',
                type: ItemType.LocalDrive,
                expanded: true,
                children: items,
            },
        ],
        name: 'My Local Drives',
        type: 'local',
        defaultItemOptions: defaultOptions,
    },
};
