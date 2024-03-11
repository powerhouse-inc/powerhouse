import { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { DateTimeLocalInput } from '.';

const meta = {
    title: 'Connect/Components/Date Time Local Input',
    component: DateTimeLocalInput,
} satisfies Meta<typeof DateTimeLocalInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {},
    render: function Wrapper(args) {
        const [value, setValue] = useState('');

        return (
            <DateTimeLocalInput
                {...args}
                value={value}
                onChange={e => {
                    setValue(e.target.value);
                    console.log(e.target.value);
                }}
            />
        );
    },
};
