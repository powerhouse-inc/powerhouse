import type { Meta, StoryObj } from '@storybook/react';
import { ConnectConfirmationModal } from './confirmation-modal';

const meta: Meta<typeof ConnectConfirmationModal> = {
    title: 'Connect/Components/Modal/ConnectConfirmationModal',
    component: ConnectConfirmationModal,
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
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        open: true,
        header: 'Title',
        body: 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua',
        cancelLabel: 'Cancel',
        continueLabel: 'Continue',
    },
};
