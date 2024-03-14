import type { Meta, StoryObj } from '@storybook/react';
import { ConnectDeleteDriveModal } from './delete-drive-modal';

const meta: Meta<typeof ConnectDeleteDriveModal> = {
    title: 'Connect/Components/Modal/ConnectDeleteDriveModal',
    component: ConnectDeleteDriveModal,
    argTypes: {
        open: { control: { type: 'boolean' } },
        children: { control: { type: 'text' } },
        onOpenChange: { control: { type: 'action' } },
        contentProps: { control: { type: 'object' } },
        overlayProps: { control: { type: 'object' } },
        body: { control: { type: 'text' } },
        header: { control: { type: 'text' } },
        onContinue: { control: { type: 'action' } },
        cancelLabel: { control: { type: 'text' } },
        continueLabel: { control: { type: 'text' } },
        onCancel: { control: { type: 'action' } },
        inputPlaceholder: { control: { type: 'text' } },
        driveName: { control: { type: 'text' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        open: true,
        header: 'Delete “Powerhouse” drive?',
        body: 'Are you sure you want to delete this drive?  All files and subfolders within it will be removed. Do you want to proceed?',
        cancelLabel: 'Cancel',
        continueLabel: 'Delete',
        inputPlaceholder: 'Enter drive name...',
        driveName: 'Powerhouse',
    },
};
