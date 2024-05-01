import { Meta, StoryObj } from '@storybook/react';
import { FileItem } from './file-item';

const meta: Meta<typeof FileItem> = {
    title: 'Connect/Components/FileItem',
    component: FileItem,
    argTypes: {
        onClick: { action: 'onClick' },
        onOptionsClick: { action: 'onOptionsClick' },
        title: { control: 'text' },
        subTitle: { control: 'text' },
        onCancelInput: { action: 'onCancelInput' },
        onSubmitInput: { action: 'onSubmitInput' },
        mode: { control: { type: 'select' }, options: ['read', 'write'] },
        item: { control: { type: 'object' } },
        icon: {
            control: { type: 'select' },
            options: ['legal', 'global', 'profile', 'budget', 'template'],
        },
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
        mode: 'read',
        title: 'Legal Contract #1',
        subTitle:
            'MakerDAO/Ecosystem Actors/Powerhouse/Chronicle Labs/Legal Contract 1',
        icon: 'profile',
        item: {
            id: '1',
            label: 'Test Folder',
            availableOffline: false,
            path: '',
            type: 'FILE',
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
