import { Meta, StoryObj } from '@storybook/react';
import { CreateDriveForm } from './create-drive-form';

const meta = {
    title: 'Connect/Components/Create Local Drive Form',
    component: CreateDriveForm,
} satisfies Meta<typeof CreateDriveForm>;

export default meta;

type Story = StoryObj<typeof meta>;

const Template: Story = {
    args: {
        onSubmit: data => {
            console.log(data);
        },
        onCancel: () => {},
        location: 'CLOUD',
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
    render: args => <CreateDriveForm {...args} />,
};
