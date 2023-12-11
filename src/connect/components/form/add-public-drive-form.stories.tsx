import { Meta, StoryObj } from '@storybook/react';
import { AddPublicDriveForm } from './add-public-drive-form';

const meta = {
    title: 'Connect/Components/Add Public Drive Form',
    component: AddPublicDriveForm,
} satisfies Meta<typeof AddPublicDriveForm>;

export default meta;

type Story = StoryObj<typeof meta>;

const Template: Story = {
    args: {
        onSubmit: data => {
            console.log(data);
        },
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
    render: args => <AddPublicDriveForm {...args} />,
};
