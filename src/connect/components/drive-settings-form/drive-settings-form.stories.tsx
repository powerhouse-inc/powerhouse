import { Meta, StoryObj } from '@storybook/react';
import { DriveSettingsForm } from '.';

const meta = {
    title: 'Connect/Components/Drive Settings Form',
    component: DriveSettingsForm,
} satisfies Meta<typeof DriveSettingsForm>;

export default meta;

type Story = StoryObj<typeof meta>;

const Template: Story = {
    args: {
        onSubmit: data => {
            console.log(data);
        },
        driveName: 'My Drive',
        sharingType: 'PRIVATE',
        availableOffline: false,
        location: 'cloud',
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
    render: args => <DriveSettingsForm {...args} />,
};
