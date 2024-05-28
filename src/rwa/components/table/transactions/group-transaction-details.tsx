import {
    AssetFormInputs,
    FeeTransactionsTable,
    FormInputs,
    FormattedNumber,
    GroupTransactionFormInputs,
    GroupTransactionsTableItem,
    ItemDetails,
    ItemDetailsProps,
    RWACreateItemModal,
    ServiceProviderFeeTypeFormInputs,
    calculateCashBalanceChange,
    useAssetForm,
    useServiceProviderFeeTypeForm,
} from '@/rwa';
import { memo } from 'react';
import { Control, useWatch } from 'react-hook-form';
import { useGroupTransactionForm } from './useGroupTransactionForm';

function CashBalanceChange(props: {
    control: Control<GroupTransactionFormInputs>;
}) {
    const { control } = props;
    const cashAmount = useWatch({ control, name: 'cashAmount' });
    const type = useWatch({ control, name: 'type' });
    const fees = useWatch({ control, name: 'fees' });

    const cashBalanceChange = calculateCashBalanceChange(
        type,
        cashAmount,
        fees,
    );

    return (
        <>
            <div className="flex items-center justify-between border-t border-gray-300 bg-gray-100 p-3 font-semibold text-gray-800">
                <div className="mr-6 text-sm text-gray-600">
                    Cash Balance Change $USD
                </div>
                <div className="h-px flex-1 border-b border-dashed border-gray-400" />
                <div className="pl-8 text-sm text-gray-900">
                    <FormattedNumber value={cashBalanceChange} />
                </div>
            </div>
        </>
    );
}

type GroupTransactionDetailsProps = Omit<
    ItemDetailsProps<GroupTransactionsTableItem, GroupTransactionFormInputs>,
    'reset' | 'submit' | 'formInputs'
> & {
    onSubmitCreateAsset: (data: AssetFormInputs) => void;
    onSubmitCreateServiceProviderFeeType: (
        data: ServiceProviderFeeTypeFormInputs,
    ) => void;
};

export function _GroupTransactionDetails(props: GroupTransactionDetailsProps) {
    const {
        state,
        tableItem,
        operation,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
        onSubmitCreateAsset,
        onSubmitCreateServiceProviderFeeType,
    } = props;

    const { serviceProviderFeeTypes, accounts } = state;

    const {
        submit,
        reset,
        formState,
        inputs,
        register,
        control,
        watch,
        append,
        remove,
        fields,
        showCreateAssetModal,
        setShowCreateAssetModal,
        setShowCreateServiceProviderFeeTypeModal,
        showCreateServiceProviderFeeTypeModal,
        canHaveTransactionFees,
    } = useGroupTransactionForm({
        item: tableItem,
        state,
        operation,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
    });

    const { errors } = formState;

    const assetFormProps = useAssetForm({
        state,
        operation: 'create',
        onSubmitCreate: data => {
            onSubmitCreateAsset(data);
            setShowCreateAssetModal(false);
        },
    });

    const serviceProviderFeeTypeFormProps = useServiceProviderFeeTypeForm({
        state,
        operation: 'create',
        onSubmitCreate: data => {
            onSubmitCreateServiceProviderFeeType(data);
            setShowCreateServiceProviderFeeTypeModal(false);
        },
    });

    const formInputs = () => (
        <>
            <FormInputs inputs={inputs} />
            {canHaveTransactionFees && (
                <FeeTransactionsTable
                    register={register}
                    feeInputs={fields}
                    serviceProviderFeeTypes={serviceProviderFeeTypes}
                    setShowServiceProviderFeeTypeModal={
                        setShowCreateServiceProviderFeeTypeModal
                    }
                    accounts={accounts}
                    control={control}
                    watch={watch}
                    remove={remove}
                    append={append}
                    errors={errors}
                    isViewOnly={operation === 'view'}
                />
            )}
            <CashBalanceChange control={control} />
        </>
    );

    return (
        <>
            <ItemDetails
                {...props}
                formInputs={formInputs}
                submit={submit}
                reset={reset}
            />
            {showCreateAssetModal && (
                <RWACreateItemModal
                    {...props}
                    {...assetFormProps}
                    open={showCreateAssetModal}
                    onOpenChange={setShowCreateAssetModal}
                    itemName="Asset"
                />
            )}
            {showCreateServiceProviderFeeTypeModal && (
                <RWACreateItemModal
                    {...props}
                    {...serviceProviderFeeTypeFormProps}
                    open={showCreateServiceProviderFeeTypeModal}
                    onOpenChange={setShowCreateServiceProviderFeeTypeModal}
                    itemName="Service Provider Fee Type"
                />
            )}
        </>
    );
}

export const GroupTransactionDetails = memo(_GroupTransactionDetails);
