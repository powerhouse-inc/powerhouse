import {
    BaseTreeItem,
    ItemsContextProvider,
    SUCCESS,
    generateMockDriveData,
    useGetItemByPath,
    useItemActions,
    useItemsContext,
} from '@/connect';
import { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { BreadcrumbProps, Breadcrumbs, BreadcrumbsProps } from '.';

const treeItems = generateMockDriveData({
    path: 'drive',
    label: 'Local Drive',
    type: 'LOCAL_DRIVE',
    expanded: false,
    isSelected: false,
    availableOffline: false,
    syncStatus: SUCCESS,
});

const meta: Meta<typeof Breadcrumbs> = {
    title: 'Connect/Components/Breadcrumbs',
    component: Breadcrumbs,
    argTypes: {
        filterPath: { control: { type: 'string' } },
        onItemClick: { control: { type: 'action' } },
        onAddNewItem: { control: { type: 'action' } },
        onSubmitInput: { control: { type: 'action' } },
        onCancelInput: { control: { type: 'action' } },
    },
    decorators: [
        Story => (
            <ItemsContextProvider items={treeItems}>
                <Story />
            </ItemsContextProvider>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        filterPath: '/folder1/folder1.2/folder1.2.1',
    },
    render: function Wrapper(args) {
        const [filterPath, setFilterPath] = useState(args.filterPath);
        const getItemByPath = useGetItemByPath();
        const actions = useItemActions();
        const { setBaseItems } = useItemsContext();

        const onItemClickHandler: BreadcrumbProps['onClick'] = (
            e,
            selectedPath,
        ) => {
            args.onItemClick?.(e, selectedPath);

            const item = getItemByPath(selectedPath);
            if (item) actions.setSelectedItem(item.id);
            setFilterPath(selectedPath);
        };

        const onCancelInputHandler: BreadcrumbsProps['onCancelInput'] =
            basepath => {
                args.onCancelInput(basepath);

                // delete virtual item if was created previously on this path
                const item = getItemByPath(`${basepath}/new-folder`);
                if (item) actions.deleteVirtualItem(item.id);
            };

        const onSubmitInputHandler: BreadcrumbsProps['onSubmitInput'] = (
            basepath,
            label,
        ) => {
            args.onSubmitInput(basepath, label);

            const newItem: BaseTreeItem = {
                id: 'new-item-id',
                parentFolder: basepath,
                path: `${basepath}/${label}`,
                label,
                type: 'FOLDER',
                availableOffline: false,
                syncStatus: SUCCESS,
            };

            setBaseItems(prev => [...prev, newItem]);
            actions.setSelectedItem(newItem.id);
            setFilterPath(newItem.path);
        };

        const onAddNewItemHandler: BreadcrumbsProps['onAddNewItem'] = (
            basePath,
            option,
        ) => {
            args.onAddNewItem(basePath, option);

            actions.newVirtualItem({
                id: 'new-folder',
                parentFolder: basePath,
                path: `${basePath}/new-folder`,
                label: option,
                type: 'FOLDER',
                action: 'NEW',
                availableOffline: false,
                syncStatus: SUCCESS,
            });
        };

        return (
            <div className="bg-white p-10">
                <Breadcrumbs
                    {...args}
                    filterPath={filterPath}
                    onItemClick={onItemClickHandler}
                    onAddNewItem={onAddNewItemHandler}
                    onSubmitInput={onSubmitInputHandler}
                    onCancelInput={onCancelInputHandler}
                />
            </div>
        );
    },
};

export const NotAllowedToCreateDocuments: Story = {
    ...Default,
    args: {
        ...Default.args,
        isAllowedToCreateDocuments: false,
    },
};
