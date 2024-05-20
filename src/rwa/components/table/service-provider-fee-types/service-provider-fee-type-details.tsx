import { ItemDetails, ServiceProviderFeeTypeDetailsProps } from '@/rwa';
import { FormInputs } from '../../inputs/form-inputs';
import { CreateAccountModal } from '../../modal/create-account-modal';
import { useAccountForm } from '../accounts/useAccountForm';
import { useServiceProviderFeeTypeForm } from './useServiceProviderFeeTypeForm';

export function ServiceProviderFeeTypeDetails(
    props: ServiceProviderFeeTypeDetailsProps,
) {
    const {
        onCancel,
        onSubmitForm,
        onSubmitCreateAccount,
        item,
        operation,
        state,
    } = props;

    const { accounts, transactions } = state;

    const account = accounts.find(({ id }) => id === item?.accountId);

    const defaultValues = {
        name: item?.name,
        feeType: item?.feeType,
        accountId: account?.id ?? accounts[0]?.id,
    };
    const {
        inputs,
        submit,
        reset,
        showCreateAccountModal,
        setShowCreateAccountModal,
    } = useServiceProviderFeeTypeForm({
        defaultValues,
        state,
        onSubmitForm,
        operation,
    });

    const formInputs = () => <FormInputs inputs={inputs} />;

    const createAccountModalProps = useAccountForm({
        defaultValues: {},
        state,
        operation: 'create',
        onSubmitForm: data => {
            onSubmitCreateAccount(data);
            setShowCreateAccountModal(false);
        },
    });

    const dependentTransactions = transactions.filter(t =>
        t.fees?.some(f => f.serviceProviderFeeTypeId === item?.id),
    );

    const dependentItemProps = {
        dependentItemName: 'transactions',
        dependentItemList: dependentTransactions.map((transaction, index) => (
            <div key={transaction.id}>Transaction #{index + 1}</div>
        )),
    };

    const formProps = {
        formInputs,
        dependentItemProps,
        submit,
        reset,
        onCancel,
    };

    return (
        <>
            <ItemDetails {...props} {...formProps} />
            {showCreateAccountModal && (
                <CreateAccountModal
                    {...createAccountModalProps}
                    open={showCreateAccountModal}
                    onOpenChange={setShowCreateAccountModal}
                    state={state}
                />
            )}
        </>
    );
}
