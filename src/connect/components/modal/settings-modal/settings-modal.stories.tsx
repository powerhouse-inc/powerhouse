import type { Meta, StoryObj } from '@storybook/react';
import { ClearStorageSettingsRow } from './clear-storage-row';
import { DocumentSelectSettingsRow } from './document-select-row';
import { SettingsModal } from './settings-modal';

const meta: Meta<typeof SettingsModal> = {
    title: 'Connect/Components/Modal/SettingsModal',
    component: SettingsModal,
    argTypes: {
        open: { control: { type: 'boolean' } },
        children: { control: { type: 'text' } },
        onOpenChange: { control: { type: 'action' } },
        contentProps: { control: { type: 'object' } },
        overlayProps: { control: { type: 'object' } },
        title: { control: { type: 'text' } },
        body: { control: { type: 'text' } },
        cancelLabel: { control: { type: 'text' } },
        saveLabel: { control: { type: 'text' } },
        onSave: { control: { type: 'action' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        open: true,
        title: 'Settings',
        body: 'These settings will apply to all drives.',
        cancelLabel: 'Cancel',
        saveLabel: 'Save',
        children: (
            <>
                <DocumentSelectSettingsRow
                    title="Document Models"
                    description="Documents enabled"
                    onChange={() => {}}
                    options={[
                        { label: 'Apple', value: 'apple' },
                        { label: 'Orange', value: 'orange' },
                        { label: 'Banana', value: 'banana' },
                        { label: 'Grape', value: 'grape' },
                        { label: 'Pear', value: 'pear' },
                        { label: 'Peach', value: 'peach' },
                    ]}
                    selected={[]}
                    selectProps={{
                        labelledBy: 'Select',
                        className: 'w-[200px]',
                    }}
                />
                <ClearStorageSettingsRow
                    onClearStorage={() => {}}
                    description="Delete previous session data"
                    buttonLabel="Clear Storage"
                />
            </>
        ),
    },
};
