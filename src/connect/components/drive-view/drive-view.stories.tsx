import { useGetDriveParent } from '@/connect/hooks/tree-view/useGetDriveParent';
import { useItemActions } from '@/connect/hooks/tree-view/useItemActions';
import { generateMockDriveData } from '@/connect/utils/mocks/tree-item';
import type { Meta, StoryObj } from '@storybook/react';
import { ItemsContextProvider } from '../../context/ItemsContext';
import { DriveView, DriveViewProps } from './drive-view';

const drives = [
    ...generateMockDriveData({
        path: 'public-only-connected',
        label: 'Public Only Connected',
        type: 'PUBLIC_DRIVE',
        status: 'AVAILABLE',
        isConnected: true,
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'public-only-disconnected',
        label: 'Public Only Disconnected',
        isConnected: false,
        status: 'AVAILABLE',
        type: 'PUBLIC_DRIVE',
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-synced',
        label: 'Available Offline Synced',
        type: 'PUBLIC_DRIVE',
        status: 'AVAILABLE_OFFLINE',
        isConnected: true,
        syncStatus: 'SYNCED',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-syncing',
        label: 'Available Offline Syncing',
        type: 'PUBLIC_DRIVE',
        status: 'AVAILABLE_OFFLINE',
        isConnected: true,
        syncStatus: 'SYNCING',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-not-yet-synced',
        label: 'Available Offline Not Synced Yet',
        type: 'PUBLIC_DRIVE',
        status: 'AVAILABLE_OFFLINE',
        isConnected: true,
        syncStatus: 'NOT_SYNCED_YET',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-disconnected',
        label: 'Available Offline Disconnected',
        isConnected: false,
        status: 'AVAILABLE',
        type: 'PUBLIC_DRIVE',
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'cloud-only-connected',
        label: 'Cloud Only Connected',
        type: 'CLOUD_DRIVE',
        status: 'AVAILABLE',
        isConnected: true,
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'cloud-only-disconnected',
        label: 'Cloud Only Disconnected',
        isConnected: false,
        status: 'AVAILABLE',
        type: 'CLOUD_DRIVE',
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-synced',
        label: 'Available Offline Synced',
        type: 'CLOUD_DRIVE',
        status: 'AVAILABLE_OFFLINE',
        isConnected: true,
        syncStatus: 'SYNCED',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-syncing',
        label: 'Available Offline Syncing',
        type: 'CLOUD_DRIVE',
        status: 'AVAILABLE_OFFLINE',
        isConnected: true,
        syncStatus: 'SYNCING',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-not-yet-synced',
        label: 'Available Offline Not Synced Yet',
        type: 'CLOUD_DRIVE',
        status: 'AVAILABLE_OFFLINE',
        isConnected: true,
        syncStatus: 'NOT_SYNCED_YET',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-disconnected',
        label: 'Available Offline Disconnected',
        isConnected: false,
        status: 'AVAILABLE',
        type: 'CLOUD_DRIVE',
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'local-available',
        label: 'Local Available',
        type: 'LOCAL_DRIVE',
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'local-error',
        label: 'Local Error',
        type: 'LOCAL_DRIVE',
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
            options: ['PUBLIC', 'local', 'cloud'],
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

    const actions = useItemActions();
    const getDriveParent = useGetDriveParent();

    const onItemClickHandler: DriveViewProps['onItemClick'] = (e, item) => {
        actions.toggleExpandedAndSelect(item.id);
        const parent = getDriveParent(item.path);

        console.log('drive:', parent);
        console.log('item:', item);

        onItemClick?.(e, item);
    };

    return <DriveView {...restArgs} onItemClick={onItemClickHandler} />;
};

export const Public: Story = {
    args: {
        name: 'Public drives',
        type: 'PUBLIC_DRIVE',
    },
    render: args => <DriveViewImpl {...(args as DriveViewProps)} />,
};

export const Cloud: Story = {
    args: {
        name: 'Secure Cloud Storage',
        type: 'CLOUD_DRIVE',
    },
    render: args => <DriveViewImpl {...(args as DriveViewProps)} />,
};

export const Local: Story = {
    args: {
        name: 'My Local Drives',
        type: 'LOCAL_DRIVE',
    },
    render: args => <DriveViewImpl {...(args as DriveViewProps)} />,
};
