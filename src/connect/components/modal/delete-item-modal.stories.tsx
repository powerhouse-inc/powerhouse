import type { Meta, StoryObj } from '@storybook/react';
import { ConnectDeleteItemModal } from './delete-item-modal';

const meta: Meta<typeof ConnectDeleteItemModal> = {
    title: 'Connect/Components/Modal/DeleteItemModal',
    component: ConnectDeleteItemModal,
    argTypes: {
        open: { control: { type: 'boolean' } },
        children: { control: { type: 'text' } },
        onClose: { control: { type: 'action' } },
        dialogProps: { control: { type: 'object' } },
        modalProps: { control: { type: 'object' } },
        overlayProps: { control: { type: 'object' } },
        body: { control: { type: 'text' } },
        header: { control: { type: 'text' } },
        onDelete: { control: { type: 'action' } },
        cancelLabel: { control: { type: 'text' } },
        deleteLabel: { control: { type: 'text' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        open: true,
        header: 'Delete “Ecosystem Actors” folder?',
        body: 'Are you sure you want to delete this folder?  All files and subfolders within it will be removed.',
        cancelLabel: 'Cancel',
        deleteLabel: 'Delete',
    },
};
