import connectLogo from '@/assets/connect.png';
import {
    UiDriveNode,
    UiNode,
    UiNodesContextProvider,
    useUiNodesContext,
} from '@/connect';
import { CLOUD, LOCAL, PUBLIC } from '@/connect/constants';
import { SharingType } from '@/connect/types';
import { mockDriveNodes, mockNodeOptions } from '@/connect/utils';
import { useEffect } from '@storybook/preview-api';
import type { Meta, StoryObj } from '@storybook/react';
import { ComponentPropsWithoutRef, useState } from 'react';
import { ConnectSidebar, DriveView } from '..';

type Args = ComponentPropsWithoutRef<typeof ConnectSidebar> & {
    driveNodes?: UiDriveNode[];
};

const meta: Meta<Args> = {
    title: 'Connect/Components/Sidebar',
    component: ConnectSidebar,
};

export default meta;
type Story = StoryObj<Args>;

const user = {
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
} as const;

export const Expanded: Story = {
    decorators: [
        Story => (
            <UiNodesContextProvider>
                <div className="relative h-screen">
                    <Story />
                </div>
            </UiNodesContextProvider>
        ),
    ],
    render: function Wrapper(args) {
        const [collapsed, setCollapsed] = useState(args.collapsed);
        const [disableHighlightStyles, setDisableHighlightStyles] =
            useState(false);
        const uiNodesContext = useUiNodesContext();
        const { driveNodes, setDriveNodes, setSelectedNode } = uiNodesContext;

        useEffect(() => {
            setDriveNodes(args.driveNodes ?? []);
            setSelectedNode(args.driveNodes?.[0] ?? null);
        }, []);

        const nodeHandlers = {
            onAddFolder: (name: string, uiNode: UiNode) => {},
            onAddFile: (file: File, parentNode: UiNode | null) => {
                console.log('onAddFile', { file, parentNode });
                return Promise.resolve();
            },
            onCopyNode: (uiNode: UiNode, targetNode: UiNode) => {
                console.log('onCopyNode', { uiNode, targetNode });
                return Promise.resolve();
            },
            onMoveNode: (uiNode: UiNode, targetNode: UiNode) => {
                console.log('onMoveNode', { uiNode, targetNode });
                return Promise.resolve();
            },
            onAddAndSelectNewFolder: (name: string) => Promise.resolve(),
            onRenameNode: (name: string, uiNode: UiNode) => {},
            onDuplicateNode: (uiNode: UiNode) => {},
            onDeleteNode: (uiNode: UiNode) => {},
            onDeleteDrive: (uiNode: UiNode) => {},
            onRenameDrive: (uiDriveNode: UiDriveNode, newName: string) => {},
            onChangeSharingType: (
                uiDriveNode: UiDriveNode,
                newSharingType: SharingType,
            ) => {},
            onChangeAvailableOffline: (
                uiDriveNode: UiDriveNode,
                newAvailableOffline: boolean,
            ) => {},
            showAddDriveModal: () => {},
            showDriveSettingsModal: (uiDriveNode: UiDriveNode) => {},
            onAddTrigger: (uiNodeDriveId: string) => {},
            onRemoveTrigger: (uiNodeDriveId: string) => {},
            onAddInvalidTrigger: (uiNodeDriveId: string) => {},
        };

        const driveNodesByType = driveNodes.reduce<
            Record<SharingType, UiDriveNode[]>
        >(
            (acc, driveNode) => {
                acc[driveNode.sharingType].push(driveNode);
                return acc;
            },
            {
                [PUBLIC]: [],
                [CLOUD]: [],
                [LOCAL]: [],
            },
        );

        return (
            <ConnectSidebar
                {...args}
                collapsed={collapsed}
                headerContent={
                    <div className="flex h-full items-center">
                        <img
                            alt="Connect logo"
                            className="h-5 object-contain"
                            src={connectLogo}
                        />
                    </div>
                }
                onToggle={() => setCollapsed(!collapsed)}
            >
                <DriveView
                    {...uiNodesContext}
                    {...nodeHandlers}
                    disableAddDrives={false}
                    driveNodes={driveNodesByType[PUBLIC]}
                    groupSharingType={PUBLIC}
                    isAllowedToCreateDocuments
                    isRemoteDrive
                    label="Public Drives"
                    nodeOptions={mockNodeOptions}
                />
                <DriveView
                    {...uiNodesContext}
                    {...nodeHandlers}
                    disableAddDrives={false}
                    driveNodes={driveNodesByType[CLOUD]}
                    groupSharingType={CLOUD}
                    isAllowedToCreateDocuments
                    isRemoteDrive
                    label="Secure Cloud Drives"
                    nodeOptions={mockNodeOptions}
                />
                <DriveView
                    {...uiNodesContext}
                    {...nodeHandlers}
                    disableAddDrives={false}
                    driveNodes={driveNodesByType[LOCAL]}
                    groupSharingType={LOCAL}
                    isAllowedToCreateDocuments
                    isRemoteDrive={false}
                    label="My Local Drives"
                    nodeOptions={mockNodeOptions}
                />
            </ConnectSidebar>
        );
    },
};

export const ExpandedWithUser: Story = {
    ...Expanded,
    args: {
        ...Expanded.args,
        ...user,
    },
};
export const ExpandedWithDrives: Story = {
    ...Expanded,
    args: {
        ...Expanded.args,
        driveNodes: mockDriveNodes,
    },
};

export const ExpandedWithDrivesAndUser: Story = {
    ...Expanded,
    args: {
        ...Expanded.args,
        ...user,
        driveNodes: mockDriveNodes,
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

export const CollapsedWithDrives: Story = {
    ...Collapsed,
    args: {
        ...Collapsed.args,
        driveNodes: mockDriveNodes,
    },
};

export const CollapsedWithDrivesAndUser: Story = {
    ...Collapsed,
    args: {
        ...Collapsed.args,
        ...user,
    },
};
