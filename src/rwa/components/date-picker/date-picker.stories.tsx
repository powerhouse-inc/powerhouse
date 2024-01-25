import { CalendarDate } from '@internationalized/date';
import type { Meta, StoryObj } from '@storybook/react';
import { RWADatePicker } from './date-picker';

const meta: Meta<typeof RWADatePicker> = {
    title: 'RWA/Components/RWADatePicker',
    component: RWADatePicker,
    argTypes: {
        label: { control: { type: 'text' } },
        value: { control: { type: 'object' } },
        onChange: { action: 'onChange' },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        label: 'Date',
        value: new CalendarDate(2024, 1, 25),
    },
};
