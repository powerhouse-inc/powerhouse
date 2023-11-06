import type { Meta, StoryObj } from '@storybook/react';
import { TextInput } from './text-input';

const meta: Meta<typeof TextInput> = {
    title: 'Powerhouse/Components/TextInput',
    component: TextInput,
    argTypes: {
        startAdornment: { control: { type: 'text' } },
        endAdornment: { control: { type: 'text' } },
        inputProps: { control: { type: 'object' } },
        textFieldProps: { control: { type: 'object' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        startAdornment: <div className="p-2">Start</div>,
        endAdornment: <div className="p-2">End</div>,
        className: 'bg-white rounded-2xl p-2',
        textFieldProps: {
            autoFocus: true,
        },
    },
};
