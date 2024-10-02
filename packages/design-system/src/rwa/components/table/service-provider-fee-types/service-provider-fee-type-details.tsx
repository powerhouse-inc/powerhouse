import {
    AccountFormInputs,
    FormInputs,
    ItemDetails,
    ItemDetailsProps,
    RWACreateItemModal,
    ServiceProviderFeeTypeFormInputs,
    ServiceProviderFeeTypeTableItem,
    useAccountForm,
    useServiceProviderFeeTypeForm,
} from '@/rwa';
import { memo } from 'react';

export type ServiceProviderFeeTypeDetailsProps = ItemDetailsProps<
    ServiceProviderFeeTypeTableItem,
    ServiceProviderFeeTypeFormInputs
> & {
    readonly onSubmitCreateAccount: (data: AccountFormInputs) => void;
};

export function _ServiceProviderFeeTypeDetails(
    props: ServiceProviderFeeTypeDetailsProps,
) {
    const {
        state,
        tableItem,
        operation,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
        onSubmitCreateAccount,
    } = props;

    const { transactions } = state;

    const {
        inputs,
        submit,
        reset,
        showCreateAccountModal,
        setShowCreateAccountModal,
    } = useServiceProviderFeeTypeForm({
        item: tableItem,
        state,
        operation,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
    });

    const formInputs = () => <FormInputs inputs={inputs} />;

    const createAccountModalProps = useAccountForm({
        state,
        operation: 'create',
        onSubmitCreate: data => {
            onSubmitCreateAccount(data);
            setShowCreateAccountModal(false);
        },
    });

    const dependentTransactions = transactions.filter(t =>
        t.fees?.some(f => f.serviceProviderFeeTypeId === tableItem?.id),
    );

    const dependentItemProps = {
        dependentItemName: 'transactions',
        dependentItemList: dependentTransactions.map((transaction, index) => (
            <div key={transaction.id}>Transaction #{index + 1}</div>
        )),
    };

    return (
        <>
            <ItemDetails
                {...props}
                dependentItemProps={dependentItemProps}
                formInputs={formInputs}
                onSubmitCreate={onSubmitCreate}
                onSubmitDelete={onSubmitDelete}
                onSubmitEdit={onSubmitEdit}
                reset={reset}
                submit={submit}
            />
            {showCreateAccountModal ? (
                <RWACreateItemModal
                    {...props}
                    {...createAccountModalProps}
                    itemName="Account"
                    onOpenChange={setShowCreateAccountModal}
                    open={showCreateAccountModal}
                />
            ) : null}
        </>
    );
}

export const ServiceProviderFeeTypeDetails = memo(
    _ServiceProviderFeeTypeDetails,
);
