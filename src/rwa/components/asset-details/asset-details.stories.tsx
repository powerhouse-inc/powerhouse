import { mockFixedIncomes, mockFixedIncomeTypes, mockSpvs } from '@/rwa/mocks';
import type { Meta, StoryObj } from '@storybook/react';
import { RWAAssetDetails } from './asset-details';

const meta: Meta<typeof RWAAssetDetails> = {
    title: 'RWA/Components/RWAAssetDetails',
    component: RWAAssetDetails,
    argTypes: {
        mode: {
            options: ['view', 'edit'],
            control: { type: 'radio' },
        },
        onCancel: { action: 'onCancel' },
        selectItemToEdit: { action: 'onEdit' },
        onClose: { action: 'onClose' },
        onSubmitForm: { action: 'onSubmit' },
        labels: { control: { type: 'object' } },
        asset: { control: { type: 'object' } },
        fixedIncomeTypes: { control: { type: 'object' } },
        hideNonEditableFields: { control: 'boolean' },
        operation: {
            options: ['create', 'edit'],
            control: { type: 'radio' },
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        operation: 'edit',
        mode: 'view',
        fixedIncomeTypes: mockFixedIncomeTypes,
        spvs: mockSpvs,
        asset: mockFixedIncomes[0],
    },
};
