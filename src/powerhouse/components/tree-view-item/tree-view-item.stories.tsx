import type { Meta, StoryObj } from '@storybook/react';
import { TreeViewItem, TreeViewItemProps } from './tree-view-item';

import CheckFilledIcon from '@/assets/icons/check-filled.svg';
import CheckIcon from '@/assets/icons/check.svg';
import CloudSlashIcon from '@/assets/icons/cloud-slash.svg';
import FolderClose from '@/assets/icons/folder-close-fill.svg';
import FolderOpen from '@/assets/icons/folder-open-fill.svg';
import SyncingIcon from '@/assets/icons/syncing.svg';

const meta: Meta<typeof TreeViewItem> = {
    title: 'Powerhouse/Components/TreeView/TreeViewItem',
    component: TreeViewItem,
    decorators: [
        Story => (
            <div className="w-[312px] p-8 bg-white to-white">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        children: { control: { type: 'text' } },
        label: { control: { type: 'text' } },
        initialOpen: { control: { type: 'boolean' } },
        expandedIcon: { control: { type: 'text' } },
        icon: { control: { type: 'text' } },
        onClick: { control: { type: 'action' } },
        onOptionsClick: { control: { type: 'action' } },
        level: { control: { type: 'number' } },
        secondaryIcon: {
            control: {
                type: 'select',
            },
            options: [
                undefined,
                CheckIcon,
                CheckFilledIcon,
                SyncingIcon,
                CloudSlashIcon,
            ],
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        label: 'Local Device',
        initialOpen: true,
        icon: FolderClose,
        expandedIcon: FolderOpen,
        secondaryIcon: SyncingIcon,
        children: (
            <>
                <TreeViewItem
                    label="Folder 1"
                    icon={FolderClose}
                    expandedIcon={FolderOpen}
                >
                    <TreeViewItem
                        label="Folder 1.1"
                        icon={FolderClose}
                        expandedIcon={FolderOpen}
                    ></TreeViewItem>
                    <TreeViewItem
                        label="Folder 1.2"
                        icon={FolderClose}
                        expandedIcon={FolderOpen}
                    >
                        <TreeViewItem
                            label="Folder 1.2.1"
                            icon={FolderClose}
                            expandedIcon={FolderOpen}
                        ></TreeViewItem>
                    </TreeViewItem>
                </TreeViewItem>
                <TreeViewItem
                    label="Folder 2"
                    icon={FolderClose}
                    expandedIcon={FolderOpen}
                >
                    <TreeViewItem
                        label="Folder 2.1"
                        icon={FolderClose}
                        expandedIcon={FolderOpen}
                    ></TreeViewItem>
                </TreeViewItem>
            </>
        ),
    },
};

const itemClassName = 'rounded-lg py-3 hover:bg-[#F1F5F9] hover:to-[#F1F5F9]';

const StyledTreeViewItem: React.FC<TreeViewItemProps> = props => {
    return (
        <TreeViewItem
            {...props}
            buttonProps={{
                className: itemClassName,
            }}
        >
            {props.children}
        </TreeViewItem>
    );
};

export const WithStyles: Story = {
    args: {
        label: 'Local Device',
        initialOpen: true,
        icon: FolderClose,
        expandedIcon: FolderOpen,
        secondaryIcon: SyncingIcon,
        buttonProps: {
            className: itemClassName,
        },
        children: (
            <>
                <StyledTreeViewItem
                    label="Folder 1"
                    icon={FolderClose}
                    expandedIcon={FolderOpen}
                >
                    <StyledTreeViewItem
                        label="Folder 1.1"
                        icon={FolderClose}
                        expandedIcon={FolderOpen}
                    ></StyledTreeViewItem>
                    <StyledTreeViewItem
                        label="Folder 1.2"
                        icon={FolderClose}
                        expandedIcon={FolderOpen}
                    >
                        <StyledTreeViewItem
                            label="Folder 1.2.1"
                            icon={FolderClose}
                            expandedIcon={FolderOpen}
                        ></StyledTreeViewItem>
                    </StyledTreeViewItem>
                </StyledTreeViewItem>
                <StyledTreeViewItem
                    label="Folder 2"
                    icon={FolderClose}
                    expandedIcon={FolderOpen}
                >
                    <StyledTreeViewItem
                        label="Folder 2.1"
                        icon={FolderClose}
                        expandedIcon={FolderOpen}
                    ></StyledTreeViewItem>
                </StyledTreeViewItem>
            </>
        ),
    },
};
