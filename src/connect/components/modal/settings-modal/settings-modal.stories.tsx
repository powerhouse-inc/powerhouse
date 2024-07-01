import type { Meta, StoryObj } from '@storybook/react';
import { ClearStorageSettingsRow } from './clear-storage-row';
import { DependencyVersions } from './dependency-versions';
import mockPackageJson from './dependency-versions/mock-package-json.json';
import { DocumentSelectSettingsRow } from './document-select-row';
import { SettingsModal } from './settings-modal';

const meta: Meta<typeof SettingsModal> = {
    title: 'Connect/Components/Modal/SettingsModal',
    component: SettingsModal,
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
                <DependencyVersions packageJson={mockPackageJson} />
            </>
        ),
    },
};
