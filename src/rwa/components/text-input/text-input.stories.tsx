import type { Meta, StoryObj } from '@storybook/react';
import { RWATextInput } from './text-input';

const meta: Meta<typeof RWATextInput> = {
    title: 'RWA/Components/RWATextInput',
    component: RWATextInput,
    argTypes: {
        inputProps: { control: { type: 'object' } },
        onChange: { control: { type: 'action' } },
        value: { control: { type: 'text' } },
        label: { control: { type: 'text' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        label: 'Label',
        inputProps: {
            placeholder: 'Placeholder',
        },
    },
};
