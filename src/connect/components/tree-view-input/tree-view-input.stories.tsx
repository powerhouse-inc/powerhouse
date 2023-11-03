import type { Meta, StoryObj } from '@storybook/react';
import { ActionType, ItemType } from '../tree-view-item';
import { ConnectTreeViewInput } from './tree-view-input';

const meta: Meta<typeof ConnectTreeViewInput> = {
    title: 'Connect/Components/TreeView',
    component: ConnectTreeViewInput,
    decorators: [
        Story => (
            <div className="bg-white p-10">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        placeholder: { control: { type: 'text' } },
        level: { control: { type: 'number' } },
        onCancel: { control: { type: 'action' } },
        onSubmit: { control: { type: 'action' } },
        item: { control: { type: 'object' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const TreeViewInput: Story = {
    args: {
        item: {
            id: 'MyDrive/Documents/MyDocuments',
            label: 'My-Documents',
            type: ItemType.Folder,
            action: ActionType.Update,
        },
        level: 0,
        placeholder: 'Folder Name',
    },
};
