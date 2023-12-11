import { Meta, StoryObj } from '@storybook/react';
import { FolderItem } from './folder-item';

const meta: Meta<typeof FolderItem> = {
    title: 'Connect/Components/FolderItem',
    component: FolderItem,
    argTypes: {
        onClick: { action: 'onClick' },
        onOptionsClick: { action: 'onOptionsClick' },
        title: { control: 'text' },
    },
    decorators: [
        Story => (
            <div className="w-[500px] bg-white p-10">
                <Story />
            </div>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        title: 'Chronicle Labs Chronicle Labs Chronicle Labs Chronicle Labs Chronicle Labs Chronicle Labs',
    },
};
