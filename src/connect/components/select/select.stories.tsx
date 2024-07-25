import { Icon } from '@/powerhouse';
import { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Select, SelectItem } from '.';

const meta: Meta<typeof Select> = {
    title: 'Connect/Components/Select',
    component: Select,
};

export default meta;

type Story = StoryObj<{
    id: string;
    items: SelectItem<string>[];
}>;

const Template: Story = {
    args: {
        id: 'drive-settings-select',
        items: [
            {
                value: 'Private',
                icon: <Icon name="hdd" />,
                description: 'Only available to you',
            },
            {
                value: 'Shared',
                icon: <Icon name="people" />,
                description: 'Only available to people in this drive',
            },
            {
                value: 'Public',
                icon: <Icon name="globe" />,
                description: 'Available to everyone',
                disabled: true,
            },
        ],
    },
    decorators: [
        Story => (
            <div className="h-[420px] bg-white p-8">
                <Story />
            </div>
        ),
    ],
};

export const Default: Story = {
    ...Template,
    render: function Wrapper(args) {
        const [value, setValue] = useState(args.items[0].value);

        return <Select {...args} value={value} onChange={setValue} />;
    },
};
