import { PUBLIC } from '@/connect/constants';
import { Meta, StoryObj } from '@storybook/react';
import { AddRemoteDriveForm } from './add-remote-drive-form';

const meta = {
    title: 'Connect/Components/Add Public Drive Form',
    component: AddRemoteDriveForm,
} satisfies Meta<typeof AddRemoteDriveForm>;

export default meta;

type Story = StoryObj<typeof meta>;

const Template: Story = {
    args: {
        onSubmit: data => {
            console.log(data);
        },
        sharingType: PUBLIC,
        onCancel: () => {},
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
};
