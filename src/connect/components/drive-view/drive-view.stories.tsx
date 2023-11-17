import type { Meta, StoryObj } from '@storybook/react';
import { ItemType, ItemStatus } from '../tree-view-item';
import { DriveView, DriveViewProps } from './drive-view';
import { ItemsContextProvider, useItemsContext } from '../../context/ItemsContext';
import { useGetDriveParent } from '@/connect/hooks/tree-view/useGetDriveParent';
import { generateMockDriveData } from '@/connect/utils/mocks/tree-item';

const drives = [
    ...generateMockDriveData({
        path: 'public-only-connected',
        label: 'Public Only Connected',
        type: ItemType.PublicDrive,
        status: ItemStatus.Available,
        isConnected: true,
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'public-only-disconnected',
        label: 'Public Only Disconnected',
        isConnected: false,
        status: ItemStatus.Available,
        type: ItemType.PublicDrive,
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-synced',
        label: 'Available Offline Synced',
        type: ItemType.PublicDrive,
        status: ItemStatus.AvailableOffline,
        isConnected: true,
        syncStatus: 'synced',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-syncing',
        label: 'Available Offline Syncing',
        type: ItemType.PublicDrive,
        status: ItemStatus.AvailableOffline,
        isConnected: true,
        syncStatus: 'syncing',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-not-yet-synced',
        label: 'Available Offline Not Synced Yet',
        type: ItemType.PublicDrive,
        status: ItemStatus.AvailableOffline,
        isConnected: true,
        syncStatus: 'not-synced-yet',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-disconnected',
        label: 'Available Offline Disconnected',
        isConnected: false,
        status: ItemStatus.Available,
        type: ItemType.PublicDrive,
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'cloud-only-connected',
        label: 'Cloud Only Connected',
        type: ItemType.CloudDrive,
        status: ItemStatus.Available,
        isConnected: true,
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'cloud-only-disconnected',
        label: 'Cloud Only Disconnected',
        isConnected: false,
        status: ItemStatus.Available,
        type: ItemType.CloudDrive,
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-synced',
        label: 'Available Offline Synced',
        type: ItemType.CloudDrive,
        status: ItemStatus.AvailableOffline,
        isConnected: true,
        syncStatus: 'synced',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-syncing',
        label: 'Available Offline Syncing',
        type: ItemType.CloudDrive,
        status: ItemStatus.AvailableOffline,
        isConnected: true,
        syncStatus: 'syncing',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-not-yet-synced',
        label: 'Available Offline Not Synced Yet',
        type: ItemType.CloudDrive,
        status: ItemStatus.AvailableOffline,
        isConnected: true,
        syncStatus: 'not-synced-yet',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-disconnected',
        label: 'Available Offline Disconnected',
        isConnected: false,
        status: ItemStatus.Available,
        type: ItemType.CloudDrive,
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'local-available',
        label: 'Local Available',
        type: ItemType.LocalDrive,
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'local-error',
        label: 'Local Error',
        type: ItemType.LocalDrive,
        expanded: true,
        error: new Error('Something went wrong'),
    }),
];

const meta: Meta<typeof DriveView> = {
    title: 'Connect/Components/DriveView',
    component: DriveView,
    parameters: {
        layout: 'centered',
    },
    decorators: [
        Story => (
            <ItemsContextProvider items={drives}>
                <div className="w-[420px] bg-neutral-1 to-neutral-1 p-10">
                    <Story />
                </div>
            </ItemsContextProvider>
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
        onItemClick: { control: { type: 'action' } },
        onDropEvent: { control: { type: 'action' } },
        onItemOptionsClick: { control: { type: 'action' } },
        defaultItemOptions: { control: { type: 'object' } },
        onDragStart: { control: { type: 'action' } },
        onDragEnd: { control: { type: 'action' } },
        onDropActivate: { control: { type: 'action' } },
        disableHighlightStyles: { control: { type: 'boolean' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const DriveViewImpl = (args: DriveViewProps) => {
    const { onItemClick, ...restArgs } = args;
    const { setItems } = useItemsContext();
    const getDriveParent = useGetDriveParent();

    const onItemClickHandler: DriveViewProps['onItemClick'] = (
        e,
        item,
    ) => {
        setItems((prevItems) => prevItems.map((prevItem) => {
            if (prevItem.id === item.id) {
                return {
                    ...prevItem,
                    isSelected: true,
                    expanded: !prevItem.expanded,
                };
            }

            return { ...prevItem, isSelected: false };
        }));

        const parent = getDriveParent(item.path);
        
        console.log('drive:', parent);
        console.log('item:', item);

        onItemClick?.(e, item);
    };

    return (
        <DriveView
            {...restArgs}
            onItemClick={onItemClickHandler}
        />
    );
};



export const Public: Story = {
    args: {
        name: 'Public drives',
        type: 'public',
    },
    render: args => <DriveViewImpl {...(args as DriveViewProps)} />,
};


export const Cloud: Story = {
    args: {
        name: 'Secure Cloud Storage',
        type: 'cloud',
    },
    render: args => <DriveViewImpl {...(args as DriveViewProps)} />,
};

export const Local: Story = {
    args: {
        name: 'My Local Drives',
        type: 'local',
    },
    render: args => <DriveViewImpl {...(args as DriveViewProps)} />,
};
