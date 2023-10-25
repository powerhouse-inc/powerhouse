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
        items: { control: { type: 'object' } },
        onItemClick: { control: { type: 'action' } },
        onDropEvent: { control: { type: 'action' } },
        onItemOptionsClick: { control: { type: 'action' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

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
        items: [
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
    },
};

export const Cloud: Story = {
    args: {
        items: [
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
    },
};

export const Local: Story = {
    args: {
        items: [
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
    },
};
