import type { Meta, StoryObj } from '@storybook/react';
import { Icon } from '..';
import { TreeViewInput } from './tree-view-input';

const icon = <Icon name="folder-open" color="#6C7275" />;
const submitIcon = <Icon name="check" color="#6C7275" />;
const cancelIcon = <Icon name="xmark" color="#6C7275" />;

const meta: Meta<typeof TreeViewInput> = {
    title: 'Powerhouse/Components/TreeView/TreeViewInput',
    component: TreeViewInput,
    argTypes: {
        icon: { control: { type: 'text' } },
        cancelIcon: { control: { type: 'text' } },
        submitIcon: { control: { type: 'text' } },
        placeholder: { control: { type: 'text' } },
        level: { control: { type: 'number' } },
        initialValue: { control: { type: 'text' } },
        onCancel: { control: { type: 'action' } },
        onSubmit: { control: { type: 'action' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        icon,
        submitIcon,
        cancelIcon,
        initialValue: 'My Documents',
        level: 0,
        placeholder: 'Folder Name',
    },
};

export const WithStyles: Story = {
    decorators: [
        Story => (
            <div className="bg-white p-10">
                <Story />
            </div>
        ),
    ],
    args: {
        icon,
        submitIcon,
        cancelIcon,
        className: 'bg-[#F1F5F9] rounded-lg h-12',
        initialValue: 'My Documents',
        level: 0,
        placeholder: 'Folder Name',
    },
};
