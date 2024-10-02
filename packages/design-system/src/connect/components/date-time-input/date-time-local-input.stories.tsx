import { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { DateTimeLocalInput } from '.';

const meta = {
    title: 'Connect/Components/Date Time Local Input',
    component: DateTimeLocalInput,
    argTypes: {
        inputType: {
            control: 'radio',
            options: ['datetime-local', 'date'],
        },
    },
} satisfies Meta<typeof DateTimeLocalInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        inputType: 'datetime-local',
    },
    render: function Wrapper(args) {
        const [value, setValue] = useState('');

        return (
            <DateTimeLocalInput
                {...args}
                onChange={e => {
                    setValue(e.target.value);
                    console.log(e.target.value);
                }}
                value={value}
            />
        );
    },
};
