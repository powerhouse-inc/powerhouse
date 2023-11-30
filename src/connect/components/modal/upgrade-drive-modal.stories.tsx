import type { Meta, StoryObj } from '@storybook/react';
import { ConnectUpgradeDriveModal } from './upgrade-drive-modal';

const meta: Meta<typeof ConnectUpgradeDriveModal> = {
    title: 'Connect/Components/Modal/UpgradeDriveModal',
    component: ConnectUpgradeDriveModal,
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
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        open: true,
        header: 'Upgrade to cloud drive',
        body: 'You are moving files from a private to a shared drive. These files will become accessible to others in the shared drive.Do you want to proceed?',
        cancelLabel: 'Cancel',
        continueLabel: 'Continue',
    },
};
