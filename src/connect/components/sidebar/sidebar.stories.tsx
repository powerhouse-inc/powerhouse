import { traverseDriveById } from '@/connect/utils';
import { action } from '@storybook/addon-actions';
import { useArgs } from '@storybook/preview-api';
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import {
    ConnectSidebar,
    DriveView,
    DriveViewProps,
    ItemStatus,
    ItemType,
} from '..';

const meta: Meta<typeof ConnectSidebar> = {
    title: 'Connect/Components',
    component: ConnectSidebar,
    decorators: [
        Story => (
            <div className="relative h-screen">
                <Story />
            </div>
        ),
    ],
    parameters: {
        layout: 'fullscreen',
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const onItemOptionsClick = action('onItemOptionsClick');

const DriveViewImpl = (args: DriveViewProps) => {
    const { drives: initialDrives, onItemClick, ...restArgs } = args;
    const [drives, setDrives] = useState(initialDrives);

    const onItemClickHandler: DriveViewProps['onItemClick'] = (
        e,
        item,
        drive,
    ) => {
        const newDrives = traverseDriveById(drives, drive.id, treeItem => {
            if (treeItem.id === item.id) {
                return {
                    ...treeItem,
                    expanded: !treeItem.expanded,
                };
            }

            return treeItem;
        });

        setDrives(newDrives);
        onItemClick?.(e, item, drive);
    };

    return (
        <DriveView
            {...restArgs}
            drives={drives}
            onItemClick={onItemClickHandler}
        />
    );
};

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

export const Sidebar: Story = {
    decorators: [
        function Component(Story, ctx) {
            const [, setArgs] = useArgs<typeof ctx.args>();

            const onToggle = () => {
                ctx.args.onToggle?.();
                setArgs({ collapsed: !ctx.args.collapsed });
            };

            return <Story args={{ ...ctx.args, onToggle }} />;
        },
    ],
    args: {
        collapsed: false,
        username: 'Willow.eth',
        address: '0x8343...3u432u32',
        children: (
            <>
                <DriveViewImpl
                    type="public"
                    name="Public Drives"
                    className="mx-2 mb-2"
                    onItemOptionsClick={onItemOptionsClick}
                    drives={[
                        {
                            id: 'drive',
                            label: 'MakerDAO Atlas',
                            type: ItemType.PublicDrive,
                            expanded: true,
                            children: items,
                        },
                    ]}
                />
                <DriveViewImpl
                    type="cloud"
                    name="Secure Cloud Storage"
                    className="mb-2"
                    onItemOptionsClick={onItemOptionsClick}
                    drives={[
                        {
                            id: 'cloud 1',
                            label: 'Powerhouse Team Drive',
                            type: ItemType.CloudDrive,
                            expanded: false,
                            children: items,
                        },
                        {
                            id: 'cloud 2',
                            label: 'Powerhouse Team Drive',
                            type: ItemType.CloudDrive,
                            expanded: true,
                            children: items,
                        },
                    ]}
                />
                <DriveViewImpl
                    type="local"
                    name="My Local Drives"
                    onItemOptionsClick={onItemOptionsClick}
                    drives={[
                        {
                            id: 'local',
                            label: 'Local Device',
                            type: ItemType.LocalDrive,
                            expanded: true,
                            children: items,
                        },
                    ]}
                />
            </>
        ),
    },
};
