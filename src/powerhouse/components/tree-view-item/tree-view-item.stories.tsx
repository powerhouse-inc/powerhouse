import { action } from '@storybook/addon-actions';
import type { Meta, StoryObj } from '@storybook/react';
import { Icon } from '..';
import { TreeViewItem, TreeViewItemProps } from './tree-view-item';
const folderCloseIcon = <Icon name="folder-close" color="#6C7275" />;
const folderOpenIcon = <Icon name="folder-open" color="#6C7275" />;
const syncingIcon = <Icon name="syncing" color="#3E90F0" />;

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
        onClick: { control: { type: 'action' } },
        onOptionsClick: { control: { type: 'action' } },
        level: { control: { type: 'number' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const optionsContent = (
    <div
        role="button"
        onClick={e => {
            e.stopPropagation();
            action('options-click')(e);
        }}
        className="w-6 h-6 focus:outline-none"
    >
        <Icon
            name="vertical-dots"
            color="#6F767E"
            className="pointer-events-none"
        />
    </div>
);

export const Primary: Story = {
    args: {
        label: 'Local Device',
        icon: folderCloseIcon,
        expandedIcon: folderOpenIcon,
        secondaryIcon: syncingIcon,
        optionsContent,
        children: (
            <>
                <TreeViewItem
                    label="Folder 1"
                    icon={folderCloseIcon}
                    expandedIcon={folderOpenIcon}
                >
                    <TreeViewItem
                        label="Folder 1.1"
                        icon={folderCloseIcon}
                        expandedIcon={folderOpenIcon}
                    ></TreeViewItem>
                    <TreeViewItem
                        label="Folder 1.2"
                        icon={folderCloseIcon}
                        expandedIcon={folderOpenIcon}
                    >
                        <TreeViewItem
                            label="Folder 1.2.1"
                            icon={folderCloseIcon}
                            expandedIcon={folderOpenIcon}
                        ></TreeViewItem>
                    </TreeViewItem>
                </TreeViewItem>
                <TreeViewItem
                    label="Folder 2"
                    icon={folderCloseIcon}
                    expandedIcon={folderOpenIcon}
                >
                    <TreeViewItem
                        label="Folder 2.1"
                        icon={folderCloseIcon}
                        expandedIcon={folderOpenIcon}
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
        icon: folderCloseIcon,
        expandedIcon: folderOpenIcon,
        secondaryIcon: syncingIcon,
        optionsContent,
        buttonProps: {
            className: itemClassName,
        },
        children: (
            <>
                <StyledTreeViewItem
                    label="Folder 1"
                    icon={folderCloseIcon}
                    expandedIcon={folderOpenIcon}
                >
                    <StyledTreeViewItem
                        label="Folder 1.1"
                        icon={folderCloseIcon}
                        expandedIcon={folderOpenIcon}
                    ></StyledTreeViewItem>
                    <StyledTreeViewItem
                        label="Folder 1.2"
                        icon={folderCloseIcon}
                        expandedIcon={folderOpenIcon}
                    >
                        <StyledTreeViewItem
                            label="Folder 1.2.1"
                            icon={folderCloseIcon}
                            expandedIcon={folderOpenIcon}
                        ></StyledTreeViewItem>
                    </StyledTreeViewItem>
                </StyledTreeViewItem>
                <StyledTreeViewItem
                    label="Folder 2"
                    icon={folderCloseIcon}
                    expandedIcon={folderOpenIcon}
                >
                    <StyledTreeViewItem
                        label="Folder 2.1"
                        icon={folderCloseIcon}
                        expandedIcon={folderOpenIcon}
                    ></StyledTreeViewItem>
                </StyledTreeViewItem>
            </>
        ),
    },
};
