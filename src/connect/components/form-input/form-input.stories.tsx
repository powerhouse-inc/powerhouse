import { Icon } from '@/powerhouse';
import { Meta, StoryObj } from '@storybook/react';
import { FormInput } from './form-input';

const meta = {
    title: 'Connect/Components/Form Input',
    component: FormInput,
} satisfies Meta<typeof FormInput>;

export default meta;

type Story = StoryObj<typeof meta>;

const Template: Story = {
    args: {
        icon: <Icon name="drive" />,
        placeholder: 'Enter value',
    },
    decorators: [
        Story => (
            <div className="grid h-48 w-96 place-items-center bg-white">
                <Story />
            </div>
        ),
    ],
};

export const Default: Story = {
    ...Template,
};

export const WithValue: Story = {
    ...Template,
    args: {
        ...Template.args,
        value: 'hello I am a value',
    },
};

export const Required: Story = {
    ...Template,
    args: {
        ...Template.args,
        required: true,
    },
};
