import { AccountDetailsProps, ItemDetails } from '@/rwa';
import { FormInputs } from '../../inputs/form-inputs';
import { useAccountForm } from './useAccountForm';

export function AccountDetails(props: AccountDetailsProps) {
    const { onSubmitForm, item, operation, state } = props;

    const { serviceProviderFeeTypes, transactions, principalLenderAccountId } =
        state;

    const isPrincipalLenderAccount = item?.id === principalLenderAccountId;

    const { submit, reset, inputs } = useAccountForm({
        defaultValues: {
            label: item?.label,
            reference: item?.reference,
        },
        state,
        onSubmitForm,
        operation,
    });

    const formInputs = () => <FormInputs inputs={inputs} />;

    const isAllowedToDeleteItem = !isPrincipalLenderAccount;

    const dependentServiceProviderFeeTypes = serviceProviderFeeTypes.filter(
        ({ accountId }) => accountId === item?.id,
    );

    const dependentTransactions = transactions
        .map((t, index) => ({
            ...t,
            txNumber: index + 1,
        }))
        .filter(
            t =>
                t.cashTransaction?.accountId === item?.id ||
                t.fixedIncomeTransaction?.accountId === item?.id,
        );

    const dependentItemName =
        dependentServiceProviderFeeTypes.length && dependentTransactions.length
            ? 'service providers and transactions'
            : dependentServiceProviderFeeTypes.length
              ? 'service providers'
              : 'transactions';

    const dependentServiceProviderList = dependentServiceProviderFeeTypes.length
        ? [
              <div key={1} className="mb-0.5 font-semibold">
                  Service providers:
              </div>,
              ...dependentServiceProviderFeeTypes.map((s, index) => (
                  <div key={index}>{s.name}</div>
              )),
          ]
        : [];

    const dependentTransactionsList = dependentTransactions.length
        ? [
              <div key={5} className="mb-0.5 mt-1 font-semibold">
                  Transactions:
              </div>,
              ...dependentTransactions.map(t => (
                  <div key={t.id}>Transaction #{t.txNumber}</div>
              )),
          ]
        : [];

    const dependentItemList = [
        ...dependentServiceProviderList,
        ...dependentTransactionsList,
    ];

    const dependentItemProps = {
        dependentItemName,
        dependentItemList,
    };

    const formProps = {
        formInputs,
        dependentItemProps,
        submit,
        reset,
        isAllowedToDeleteItem,
    };

    return <ItemDetails {...props} {...formProps} />;
}
