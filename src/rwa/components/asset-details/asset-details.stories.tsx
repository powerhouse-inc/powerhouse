import { CalendarDate } from '@internationalized/date';
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
        onEdit: { action: 'onEdit' },
        onSubmitForm: { action: 'onSubmit' },
        labels: { control: { type: 'object' } },
        asset: { control: { type: 'object' } },
        assetTypeOptions: { control: { type: 'object' } },
        maturityOptions: { control: { type: 'object' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        mode: 'view',
        asset: {
            id: '1',
            purchaseTimestamp: new CalendarDate(2024, 1, 12),
            assetTypeId: '91279GF8',
            maturityDate: 'purchase',
            cusip: '$1,000,000.00',
            isin: '$1,000,000.00',
            assetName: '-',
            notional: '-',
            purchaseProceeds: '$1,000,000.00',
            totalDiscount: '200,000',
            currentValue: '1,656,073.70',
            realisedSurplus: '0',
            totalSurplus: '1,656,073.70',
            unitPrice: '99.64%',
        },
        assetTypeOptions: [
            { id: '91279GF8', label: 'T-Bill 91279GF8' },
            { id: '91279GF9', label: 'T-Bill 91279GF9' },
        ],
        maturityOptions: [
            { id: 'purchase', label: 'Purchase' },
            { id: 'mature', label: 'Mature' },
        ],
        labels: {
            title: 'Asset Details',
            editAsset: 'Edit Asset',
            saveEdits: 'Save Edits',
            cancelEdits: 'Cancel',
            purchaseTimestamp: 'Purchase Timestamp',
            assetType: 'Asset Type',
            maturityDate: 'Maturity Date',
            cusip: 'CUSIP',
            isin: 'ISIN',
            assetName: 'Asset Name',
            notional: 'Notional',
            purchaseProceeds: 'Purchase Proceeds $USD',
            unitPrice: 'Unit Price',
            totalDiscount: 'Total Discount',
            currentValue: 'Current Value',
            realisedSurplus: 'Realised Surplus',
            totalSurplus: 'Total Surplus',
        },
    },
};
