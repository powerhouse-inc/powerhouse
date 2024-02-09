import type { Meta, StoryObj } from '@storybook/react';
import { addDays } from 'date-fns';
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
        asset: {
            id: '1',
            name: 'Test Asset',
            fixedIncomeTypeId: '1',
            spvId: '1',
            maturity: addDays(new Date(), 30).toDateString(),
            ISIN: '123456789',
            CUSIP: '987654321',
            coupon: 5,
            notional: 1000000,
            purchaseDate: addDays(new Date(), -30).toDateString(),
            purchasePrice: 1000000,
            purchaseProceeds: 1000000,
            totalDiscount: 1000000,
            annualizedYield: 1000000,
        },
    },
};
