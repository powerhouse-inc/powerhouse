import { CalendarDate } from '@internationalized/date';
import type { Meta, StoryObj } from '@storybook/react';
import { RWATXDetail } from './tx-detail';

const meta: Meta<typeof RWATXDetail> = {
    title: 'RWA/Components/RWATXDetail',
    component: RWATXDetail,
    argTypes: {
        labels: { control: 'object' },
        tx: { control: 'object' },
        onEdit: { action: 'edit' },
        assetTypeOptions: { control: 'object' },
        cusipIsinAssetNameOptions: { control: 'object' },
        mode: {
            options: ['view', 'edit'],
            control: { type: 'radio' },
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        mode: 'view',
        assetTypeOptions: [
            { id: '91279GF8', label: 'T-Bill 91279GF8' },
            { id: '91279GF9', label: 'T-Bill 91279GF9' },
        ],
        cusipIsinAssetNameOptions: [
            { id: 'purchase', label: 'Purchase' },
            { id: 'sale', label: 'Sale' },
        ],
        tx: {
            id: '1',
            assetTypeId: '91279GF8',
            timestamp: new CalendarDate(2024, 1, 25),
            cusipIsinAssetNameId: 'purchase',
            transactionType: '$1,000,000.00',
            assetProceedsUSD: '$1,000,000.00',
            unitPrice: '99.64%',
            cashBalanceChange: '-996,510.33',
            fees: [
                {
                    id: '1',
                    serviceProvider: 'Service Provider 1',
                    feeType: 'Fee Type 1',
                    accountID: 'Account ID 1',
                    fee: 1.0,
                },
                {
                    id: '2',
                    serviceProvider: 'Service Provider 2',
                    feeType: 'Fee Type 2',
                    accountID: 'Account ID 2',
                    fee: 2.0,
                },
            ],
        },
        labels: {
            transaction: 'Transaction',
            editTransaction: 'Edit Transaction',
            saveEdits: 'Save Edits',
            cancelEdits: 'Cancel',
            assetType: 'Asset Type',
            timestamp: 'Timestamp',
            cusipIsinAssetName: 'CUSIP/Isin/Asset name',
            transactionType: 'Transaction Type',
            assetProceedsUSD: 'Asset Proceeds $USD',
            unitPrice: 'Unit Price',
            fees: 'Fees',
            feesTable: {
                serviceProvider: 'Service Provider',
                feeType: 'Fee Type',
                accountID: 'Account ID',
                fee: 'Fee $ USD',
            },
            cashBalanceChange: 'Cash Balance Change $',
        },
    },
};
