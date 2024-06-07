import {
    ConnectDropdownMenuItem,
    ERROR,
    MISSING,
    SUCCESS,
    SYNCING,
    defaultDropdownMenuOptions,
} from '@/connect';
import { useGetDriveParent } from '@/connect/hooks/tree-view/useGetDriveParent';
import { useItemActions } from '@/connect/hooks/tree-view/useItemActions';
import { generateMockDriveData } from '@/connect/utils/mocks/tree-item';
import type { Meta, StoryObj } from '@storybook/react';
import { ItemsContextProvider } from '../../context/ItemsContext';
import { DriveView, DriveViewProps } from './drive-view';
import { mockCustomDriveIcon } from './mocks';

const filteredDriveOptions = defaultDropdownMenuOptions.filter(
    option => option.id !== 'delete',
);

const drives = [
    ...generateMockDriveData({
        options: filteredDriveOptions as ConnectDropdownMenuItem[],
        path: 'public-only-connected',
        label: 'Public Only Connected',
        type: 'PUBLIC_DRIVE',
        expanded: false,
        availableOffline: false,
        syncStatus: SUCCESS,
        // @ts-expect-error mock
        icon: mockCustomDriveIcon,
    }),
    ...generateMockDriveData({
        path: 'public-only-disconnected',
        label: 'Public Only Disconnected',
        type: 'PUBLIC_DRIVE',
        expanded: true,
        availableOffline: false,
        syncStatus: MISSING,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-synced',
        label: 'Available Offline Synced',
        type: 'PUBLIC_DRIVE',
        expanded: false,
        availableOffline: false,
        syncStatus: SUCCESS,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-syncing',
        label: 'Available Offline Syncing',
        type: 'PUBLIC_DRIVE',
        expanded: false,
        availableOffline: false,
        syncStatus: SYNCING,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-not-yet-synced',
        label: 'Available Offline Not Synced Yet',
        type: 'PUBLIC_DRIVE',
        expanded: false,
        availableOffline: true,
        syncStatus: SYNCING,
    }),
    ...generateMockDriveData({
        path: 'public-available-offline-disconnected',
        label: 'Available Offline Disconnected',
        type: 'PUBLIC_DRIVE',
        expanded: true,
        availableOffline: true,
        syncStatus: MISSING,
    }),
    ...generateMockDriveData({
        path: 'cloud-only-connected',
        label: 'Cloud Only Connected',
        type: 'CLOUD_DRIVE',
        expanded: false,
        availableOffline: false,
        syncStatus: SUCCESS,
    }),
    ...generateMockDriveData({
        path: 'cloud-only-disconnected',
        label: 'Cloud Only Disconnected',
        type: 'CLOUD_DRIVE',
        expanded: true,
        availableOffline: false,
        syncStatus: MISSING,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-synced',
        label: 'Available Offline Synced',
        type: 'CLOUD_DRIVE',
        expanded: false,
        availableOffline: true,
        syncStatus: SUCCESS,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-syncing',
        label: 'Available Offline Syncing',
        type: 'CLOUD_DRIVE',
        expanded: false,
        availableOffline: true,
        syncStatus: SYNCING,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-not-yet-synced',
        label: 'Available Offline Not Synced Yet',
        type: 'CLOUD_DRIVE',
        expanded: false,
        availableOffline: true,
        syncStatus: SYNCING,
    }),
    ...generateMockDriveData({
        path: 'cloud-available-offline-disconnected',
        label: 'Available Offline Disconnected',
        type: 'CLOUD_DRIVE',
        expanded: true,
        availableOffline: true,
        syncStatus: MISSING,
    }),
    ...generateMockDriveData({
        path: 'local-available',
        label: 'Local Available',
        type: 'LOCAL_DRIVE',
        expanded: true,
        availableOffline: true,
        syncStatus: SUCCESS,
    }),
    ...generateMockDriveData({
        path: 'local-error',
        label: 'Local Error',
        type: 'LOCAL_DRIVE',
        expanded: true,
        error: new Error('Something went wrong'),
        availableOffline: false,
        syncStatus: ERROR,
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
                <div className="w-[420px] bg-gray-50 p-10">
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
            options: ['PUBLIC', 'LOCAL', 'CLOUD'],
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
        disableAddDrives: { control: { type: 'boolean' } },
        displaySyncFolderIcons: { control: { type: 'boolean' } },
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
        disableAddDrives: false,
    },
    render: args => <DriveViewImpl {...(args as DriveViewProps)} />,
};

export const NotAllowedToCreateDocuments: Story = {
    ...Local,
    args: {
        ...Local.args,
        isAllowedToCreateDocuments: false,
    },
};
