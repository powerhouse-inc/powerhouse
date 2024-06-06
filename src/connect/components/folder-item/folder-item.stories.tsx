import { Meta, StoryObj } from '@storybook/react';
import { FolderItem } from './folder-item';

const meta: Meta<typeof FolderItem> = {
    title: 'Connect/Components/FolderItem',
    component: FolderItem,
    argTypes: {
        onClick: { action: 'onClick' },
        onOptionsClick: { action: 'onOptionsClick' },
        title: { control: 'text' },
        mode: { control: { type: 'select', options: ['read', 'write'] } },
        onDragStart: { action: 'onDragStart' },
        onDragEnd: { action: 'onDragEnd' },
        onDropEvent: { action: 'onDropEvent' },
        item: { control: { type: 'object' } },
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

export const ReadMode: Story = {
    args: {
        title: 'Chronicle Labs Chronicle Labs Chronicle Labs Chronicle Labs Chronicle Labs Chronicle Labs',
        item: {
            id: '1',
            label: 'Test Folder',
            availableOffline: false,
            path: '',
            type: 'FOLDER',
            syncStatus: 'SYNCING',
        },
    },
};

export const WriteMode: Story = {
    ...ReadMode,
    args: {
        ...ReadMode.args,
        mode: 'write',
    },
};

export const NotAllowedToCreateDocuments: Story = {
    ...ReadMode,
    args: {
        ...ReadMode.args,
        isAllowedToCreateDocuments: false,
    },
};
