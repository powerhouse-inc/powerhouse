import type { Meta, StoryObj } from '@storybook/react';
import { RWASelect } from './select';

const meta: Meta<typeof RWASelect> = {
    title: 'RWA/Components/RWASelect',
    component: RWASelect,
    argTypes: {
        label: { control: { type: 'text' } },
        options: { control: { type: 'object' } },
        onSelectionChange: { control: { type: 'action' } },
        buttonProps: { control: { type: 'object' } },
        listBoxItemProps: { control: { type: 'object' } },
        listBoxProps: { control: { type: 'object' } },
        selectedKey: { control: { type: 'text' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        label: 'Favorite Animal',
        options: [
            { id: 'aardvark', label: 'Aardvark' },
            { id: 'cat', label: 'Cat' },
            { id: 'dog', label: 'Dog' },
            { id: 'kangaroo', label: 'Kangaroo' },
            { id: 'panda', label: 'Panda' },
            { id: 'snake', label: 'Snake' },
        ],
    },
};
