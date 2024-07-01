import type { Meta, StoryObj } from '@storybook/react';
import { RenameNodeModal } from './rename-node';

const meta: Meta<typeof RenameNodeModal> = {
    title: 'Connect/Components/Modal/RenameNode',
    component: RenameNodeModal,
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
