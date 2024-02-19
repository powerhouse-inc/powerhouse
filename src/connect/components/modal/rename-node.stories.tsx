import type { Meta, StoryObj } from '@storybook/react';
import { RenameNodeModal } from './rename-node';

const meta: Meta<typeof RenameNodeModal> = {
    title: 'Connect/Components/Modal/RenameNode',
    component: RenameNodeModal,
    argTypes: {
        open: { control: { type: 'boolean' } },
        children: { control: { type: 'text' } },
        onOpenChange: { control: { type: 'action' } },
        contentProps: { control: { type: 'object' } },
        overlayProps: { control: { type: 'object' } },
        placeholder: { control: { type: 'text' } },
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
        placeholder: 'Document name',
        header: 'Create new document',
        cancelLabel: 'Cancel',
        continueLabel: 'Create',
    },
};
