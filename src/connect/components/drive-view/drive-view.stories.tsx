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
        type: 'public-drive',
        status: 'available',
        isConnected: true,
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'public-only-disconnected',
        label: 'Public Only Disconnected',
        isConnected: false,
        status: 'available',
        type: 'public-drive',
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-synced',
        label: 'Available Offline Synced',
        type: 'public-drive',
        status: 'available-offline',
        isConnected: true,
        syncStatus: 'synced',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-syncing',
        label: 'Available Offline Syncing',
        type: 'public-drive',
        status: 'available-offline',
        isConnected: true,
        syncStatus: 'syncing',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-not-yet-synced',
        label: 'Available Offline Not Synced Yet',
        type: 'public-drive',
        status: 'available-offline',
        isConnected: true,
        syncStatus: 'not-synced-yet',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-disconnected',
        label: 'Available Offline Disconnected',
        isConnected: false,
        status: 'available',
        type: 'public-drive',
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'cloud-only-connected',
        label: 'Cloud Only Connected',
        type: 'cloud-drive',
        status: 'available',
        isConnected: true,
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'cloud-only-disconnected',
        label: 'Cloud Only Disconnected',
        isConnected: false,
        status: 'available',
        type: 'cloud-drive',
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-synced',
        label: 'Available Offline Synced',
        type: 'cloud-drive',
        status: 'available-offline',
        isConnected: true,
        syncStatus: 'synced',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-syncing',
        label: 'Available Offline Syncing',
        type: 'cloud-drive',
        status: 'available-offline',
        isConnected: true,
        syncStatus: 'syncing',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-not-yet-synced',
        label: 'Available Offline Not Synced Yet',
        type: 'cloud-drive',
        status: 'available-offline',
        isConnected: true,
        syncStatus: 'not-synced-yet',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-disconnected',
        label: 'Available Offline Disconnected',
        isConnected: false,
        status: 'available',
        type: 'cloud-drive',
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'local-available',
        label: 'Local Available',
        type: 'local-drive',
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'local-error',
        label: 'Local Error',
        type: 'local-drive',
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
        type: 'public-drive',
    },
    render: args => <DriveViewImpl {...(args as DriveViewProps)} />,
};

export const Cloud: Story = {
    args: {
        name: 'Secure Cloud Storage',
        type: 'cloud-drive',
    },
    render: args => <DriveViewImpl {...(args as DriveViewProps)} />,
};

export const Local: Story = {
    args: {
        name: 'My Local Drives',
        type: 'local-drive',
    },
    render: args => <DriveViewImpl {...(args as DriveViewProps)} />,
};
