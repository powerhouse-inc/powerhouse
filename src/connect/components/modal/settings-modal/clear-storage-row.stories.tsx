import type { Meta, StoryObj } from '@storybook/react';
import { ClearStorageSettingsRow } from './clear-storage-row';

const meta: Meta<typeof ClearStorageSettingsRow> = {
    title: 'Connect/Components/Modal/SettingsModal/ClearStorageSettingsRow',
    component: ClearStorageSettingsRow,
    argTypes: {
        title: { control: { type: 'text' } },
        description: { control: { type: 'text' } },
        children: { control: { type: 'object' } },
        buttonLabel: { control: { type: 'text' } },
        onClearStorage: { control: { type: 'action' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        description: 'Delete previous session data',
        buttonLabel: 'Clear Data',
    },
};
