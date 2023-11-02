import CheckIcon from '@/assets/icons/check-fill.svg';
import FolderOpen from '@/assets/icons/folder-open-fill.svg';
import CancelIcon from '@/assets/icons/xmark.svg';
import type { Meta, StoryObj } from '@storybook/react';
import { TreeViewInput } from './tree-view-input';

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
        icon: <img src={FolderOpen} />,
        initialValue: 'My Documents',
        level: 0,
        placeholder: 'Folder Name',
        submitIcon: <img src={CheckIcon} className="w-6 h-6" />,
        cancelIcon: (
            <div className="w-6 h-6 flex items-center justify-center">
                <img src={CancelIcon} alt="" />
            </div>
        ),
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
        className: 'bg-[#F1F5F9] rounded-lg h-12',
        icon: <img src={FolderOpen} />,
        initialValue: 'My Documents',
        level: 0,
        placeholder: 'Folder Name',
        submitIcon: <img src={CheckIcon} className="w-6 h-6" />,
        cancelIcon: (
            <div className="w-6 h-6 flex items-center justify-center">
                <img src={CancelIcon} alt="" />
            </div>
        ),
    },
};
