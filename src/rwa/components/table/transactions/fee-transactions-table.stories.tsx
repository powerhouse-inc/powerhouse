import { Icon } from '@/powerhouse';
import { ServiceProviderFeeType } from '@/rwa';
import {
    mockGroupTransactions,
    mockServiceProviderFeeTypes,
} from '@/rwa/mocks';
import { Meta, StoryObj } from '@storybook/react';
import { useFieldArray, useForm } from 'react-hook-form';
import { GroupTransactionFormInputs } from '../types';
import { FeeTransactionsTable } from './fee-transactions-table';

const meta = {
    title: 'RWA/Components/Fee Transactions Table',
    component: FeeTransactionsTable,
} satisfies Meta<typeof FeeTransactionsTable>;

export default meta;

type Story = StoryObj<{
    serviceProviderFeeTypes: ServiceProviderFeeType[];
    isViewOnly: boolean;
}>;

export const Primary: Story = {
    args: {
        serviceProviderFeeTypes: mockServiceProviderFeeTypes,
        isViewOnly: false,
    },
    render: function Wrapper(args) {
        const transaction = mockGroupTransactions[0];

        const {
            control,
            register,
            watch,
            formState: { errors },
        } = useForm<GroupTransactionFormInputs>({
            defaultValues: {
                fees: transaction.fees,
            },
        });

        const { fields, append, remove } = useFieldArray({
            control,
            name: 'fees',
        });
        return (
            <>
                <FeeTransactionsTable
                    {...args}
                    feeInputs={fields}
                    register={register}
                    control={control}
                    watch={watch}
                    append={append}
                    remove={remove}
                    errors={errors}
                />
                <button
                    onClick={() =>
                        append({
                            amount: 0,
                            serviceProviderFeeTypeId:
                                args.serviceProviderFeeTypes[0].id,
                        })
                    }
                    className="flex w-full items-center justify-center gap-x-2 rounded-lg bg-white p-2 text-sm font-semibold text-gray-900"
                >
                    <span>Add Fee</span>
                    <Icon name="plus" size={14} />
                </button>
            </>
        );
    },
};
