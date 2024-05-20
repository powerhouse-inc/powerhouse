import { Account, ServiceProviderFeeType } from '@/rwa';
import { mockAccounts, mockServiceProviderFeeTypes } from '@/rwa/mocks';
import { Meta, StoryObj } from '@storybook/react';
import { useFieldArray, useForm } from 'react-hook-form';
import { GroupTransactionFormInputs, TransactionFeeInput } from '../types';
import { FeeTransactionsTable } from './fee-transactions-table';

const meta = {
    title: 'RWA/Components/Fee Transactions Table',
    component: FeeTransactionsTable,
} satisfies Meta<typeof FeeTransactionsTable>;

export default meta;

type Story = StoryObj<{
    serviceProviderFeeTypes: ServiceProviderFeeType[];
    accounts: Account[];
    isViewOnly: boolean;
    feeInputs: TransactionFeeInput[];
}>;

export const Empty: Story = {
    args: {
        serviceProviderFeeTypes: [],
        accounts: [],
        isViewOnly: false,
        feeInputs: [],
    },
    render: function Wrapper(args) {
        const {
            control,
            register,
            watch,
            formState: { errors },
        } = useForm<GroupTransactionFormInputs>();

        const { fields, append, remove } = useFieldArray({
            control,
            name: 'fees',
        });
        return (
            <FeeTransactionsTable
                {...args}
                setShowServiceProviderFeeTypeModal={() => {}}
                feeInputs={fields}
                register={register}
                control={control}
                watch={watch}
                append={append}
                remove={remove}
                errors={errors}
            />
        );
    },
};

export const WithData: Story = {
    ...Empty,
    args: {
        serviceProviderFeeTypes: mockServiceProviderFeeTypes,
        accounts: mockAccounts,
        isViewOnly: false,
        feeInputs: [
            {
                amount: 1000,
                serviceProviderFeeTypeId: mockServiceProviderFeeTypes[0].id,
            },
            {
                amount: 2000,
                serviceProviderFeeTypeId: mockServiceProviderFeeTypes[1].id,
            },
        ],
    },
};
