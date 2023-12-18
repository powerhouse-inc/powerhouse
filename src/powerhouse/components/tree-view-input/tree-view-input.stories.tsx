import type { Meta, StoryObj } from '@storybook/react';
import { Icon } from '..';
import { TreeViewInput } from './tree-view-input';

const submitIcon = <Icon name="check" className="text-gray-600" />;
const cancelIcon = <Icon name="xmark" className="text-gray-600" />;

const meta: Meta<typeof TreeViewInput> = {
    title: 'Powerhouse/Components/TreeView/TreeViewInput',
    component: TreeViewInput,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        submitIcon,
        cancelIcon,
        defaultValue:
            'My Documents lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, voluptatum.',
        placeholder: 'Folder Name',
    },
};

export const WithStyles: Story = {
    ...Primary,
    decorators: [
        Story => (
            <div className="bg-white p-10">
                <Story />
            </div>
        ),
    ],
    args: {
        ...Primary.args,
        className: 'bg-slate-50 rounded-lg h-12',
    },
};
