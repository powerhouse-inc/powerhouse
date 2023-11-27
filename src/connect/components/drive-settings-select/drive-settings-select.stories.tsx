import { Icon } from '@/powerhouse';
import { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { DriveSettingsSelect, SelectItem } from '.';

const meta = {
    title: 'Connect/Components/Drive Settings Select',
    component: DriveSettingsSelect,
} satisfies Meta<typeof DriveSettingsSelect>;

export default meta;

type Story = StoryObj<{
    id: string;
    items: SelectItem[];
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

        return (
            <DriveSettingsSelect {...args} value={value} onChange={setValue} />
        );
    },
};
