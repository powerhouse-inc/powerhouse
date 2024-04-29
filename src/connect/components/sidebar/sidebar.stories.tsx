import connectLogo from '@/assets/connect.png';
import { SUCCESS, TreeItem } from '@/connect';
import { ItemsContextProvider } from '@/connect/context/ItemsContext';
import { useItemActions } from '@/connect/hooks/tree-view/useItemActions';
import { generateMockDriveData } from '@/connect/utils/mocks/tree-item';
import { action } from '@storybook/addon-actions';
import { useArgs } from '@storybook/preview-api';
import type { Meta, StoryObj } from '@storybook/react';
import { ComponentPropsWithoutRef } from 'react';
import { ConnectSidebar, DriveView, DriveViewProps } from '..';

const emptyDrives: TreeItem[] = [];

const drives = [
    ...generateMockDriveData({
        path: 'drive',
        label: 'MakerDAO Atlas',
        type: 'PUBLIC_DRIVE',
        expanded: true,
        availableOffline: false,
        syncStatus: SUCCESS,
    }),
    ...generateMockDriveData({
        path: 'cloud',
        label: 'Powerhouse Team Drive',
        type: 'CLOUD_DRIVE',
        expanded: false,
        availableOffline: false,
        syncStatus: SUCCESS,
    }),
    ...generateMockDriveData({
        path: 'cloud-2',
        label: 'Powerhouse Team Drive 2',
        type: 'CLOUD_DRIVE',
        expanded: true,
        availableOffline: false,
        syncStatus: SUCCESS,
    }),
    ...generateMockDriveData({
        path: 'local',
        label: 'Local Device',
        type: 'LOCAL_DRIVE',
        expanded: true,
        availableOffline: false,
        syncStatus: SUCCESS,
    }),
];

type Args = ComponentPropsWithoutRef<typeof ConnectSidebar> & {
    drives: TreeItem[];
};

const meta: Meta<Args> = {
    title: 'Connect/Components/Sidebar',
    component: ConnectSidebar,
    parameters: {
        layout: 'fullscreen',
    },
};

export default meta;
type Story = StoryObj<Args>;

const onItemOptionsClick = action('onItemOptionsClick');

const DriveViewImpl = (args: DriveViewProps) => {
    const { onItemClick, ...restArgs } = args;
    const actions = useItemActions();

    const onItemClickHandler: DriveViewProps['onItemClick'] = (e, item) => {
        actions.toggleExpandedAndSelect(item.id);
        onItemClick?.(e, item);
    };

    return <DriveView {...restArgs} onItemClick={onItemClickHandler} />;
};

const headerContent = (
    <div className="flex h-full items-center">
        <img
            src={connectLogo}
            alt="Connect logo"
            className="h-5 object-contain"
        />
    </div>
);

const children = (
    <>
        <DriveViewImpl
            type="PUBLIC_DRIVE"
            name="Public Drives"
            onItemOptionsClick={onItemOptionsClick}
        />
        <DriveViewImpl
            type="CLOUD_DRIVE"
            name="Secure Cloud Storage"
            onItemOptionsClick={onItemOptionsClick}
        />
        <DriveViewImpl
            type="LOCAL_DRIVE"
            name="My Local Drives"
            onItemOptionsClick={onItemOptionsClick}
        />
    </>
);

const user = {
    address: '0x8343...3u432u32',
};

const userWithName = {
    ...user,
    username: 'Willow.eth',
};

const userWithAvatar = {
    ...user,
    avatarUrl: 'https://euc.li/sepolia/acaldas-powerhouse.eth',
};

const userWithAvatarAndName = {
    ...userWithAvatar,
    ...userWithName,
};

export const Expanded: Story = {
    decorators: [
        (Story, { args }) => (
            <ItemsContextProvider items={args.drives}>
                <div className="relative h-screen">
                    <Story />
                </div>
            </ItemsContextProvider>
        ),
    ],
    render: function Wrapper(args) {
        const [{ collapsed, ...restArgs }, updateArgs] = useArgs<typeof args>();
        return (
            <ConnectSidebar
                collapsed={collapsed}
                {...restArgs}
                onToggle={() => updateArgs({ collapsed: !collapsed })}
            />
        );
    },
    args: {
        drives: emptyDrives,
        headerContent,
        children,
    },
};

export const ExpandedWithUser: Story = {
    ...Expanded,
    args: {
        ...Expanded.args,
        ...user,
    },
};

export const ExpandedWithUserAndAvatar: Story = {
    ...Expanded,
    args: {
        ...Expanded.args,
        ...userWithAvatar,
    },
};

export const ExpandedWithUserAndName: Story = {
    ...Expanded,
    args: {
        ...Expanded.args,
        ...userWithName,
    },
};

export const ExpandedWithUserAndAvatarAndName: Story = {
    ...Expanded,
    args: {
        ...Expanded.args,
        ...userWithAvatarAndName,
    },
};

export const ExpandedWithUserAndAvatarAndNameLoading: Story = {
    ...Expanded,
    args: {
        ...Expanded.args,
        ...userWithAvatarAndName,
        loadingUser: true,
    },
};

export const ExpandedWithDrives: Story = {
    ...Expanded,
    args: {
        ...Expanded.args,
        drives,
    },
};

export const ExpandedWithDrivesAndUser: Story = {
    ...Expanded,
    args: {
        ...Expanded.args,
        drives,
        ...user,
    },
};

export const ExpandedWithDrivesAndUserAndAvatar: Story = {
    ...Expanded,
    args: {
        ...Expanded.args,
        drives,
        ...userWithAvatar,
    },
};

export const ExpandedWithDrivesAndUserAndAvatarAndName: Story = {
    ...Expanded,
    args: {
        ...Expanded.args,
        drives,
        ...userWithAvatarAndName,
    },
};

export const Collapsed: Story = {
    ...Expanded,
    args: {
        ...Expanded.args,
        collapsed: true,
    },
};

export const CollapsedWithUser: Story = {
    ...Collapsed,
    args: {
        ...Collapsed.args,
        ...user,
    },
};

export const CollapsedWithUserAndName: Story = {
    ...Collapsed,
    args: {
        ...Collapsed.args,
        ...userWithName,
    },
};

export const CollapsedWithUserAndAvatar: Story = {
    ...Collapsed,
    args: {
        ...Collapsed.args,
        ...userWithAvatar,
    },
};

export const CollapsedWithUserAndAvatarAndName: Story = {
    ...Collapsed,
    args: {
        ...Collapsed.args,
        ...userWithAvatarAndName,
    },
};

export const CollapsedWithDrives: Story = {
    ...Collapsed,
    args: {
        ...Collapsed.args,
        drives,
    },
};

export const CollapsedWithDrivesAndUser: Story = {
    ...Collapsed,
    args: {
        ...Collapsed.args,
        drives,
        ...user,
    },
};

export const CollapsedWithDrivesAndUserAndAvatar: Story = {
    ...Collapsed,
    args: {
        ...Collapsed.args,
        drives,
        ...userWithAvatar,
    },
};

export const CollapsedWithDrivesAndUserAndAvatarAndName: Story = {
    ...Collapsed,
    args: {
        ...Collapsed.args,
        drives,
        ...userWithAvatarAndName,
    },
};
