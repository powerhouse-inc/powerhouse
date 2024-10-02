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
    serviceProviderFeeTypeOptions: { label: string; value: string }[];
    accounts: Account[];
    isViewOnly: boolean;
    feeInputs: TransactionFeeInput[];
}>;

export const Empty: Story = {
    args: {
        serviceProviderFeeTypes: [],
        serviceProviderFeeTypeOptions: [],
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
                append={append}
                control={control}
                errors={errors}
                feeInputs={fields}
                register={register}
                remove={remove}
                setShowServiceProviderFeeTypeModal={() => {}}
                watch={watch}
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
