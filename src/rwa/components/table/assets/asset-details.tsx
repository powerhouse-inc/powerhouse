import {
    AssetFormInputs,
    AssetsTableItem,
    FixedIncomeTypeFormInputs,
    FormInputs,
    ItemDetails,
    ItemDetailsProps,
    RWACreateItemModal,
    SPVFormInputs,
    useAssetForm,
    useFixedIncomeTypeForm,
    useSpvForm,
} from '@/rwa';
import { memo } from 'react';

type AssetDetailsProps = ItemDetailsProps<AssetsTableItem, AssetFormInputs> & {
    readonly onSubmitCreateFixedIncomeType: (
        data: FixedIncomeTypeFormInputs,
    ) => void;
    readonly onSubmitCreateSpv: (data: SPVFormInputs) => void;
};

export function _AssetDetails(props: AssetDetailsProps) {
    const {
        state,
        tableItem,
        operation,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
        onSubmitCreateFixedIncomeType,
        onSubmitCreateSpv,
    } = props;

    const { transactions } = state;

    const {
        submit,
        reset,
        inputs,
        showCreateFixedIncomeTypeModal,
        setShowCreateFixedIncomeTypeModal,
        showCreateSpvModal,
        setShowCreateSpvModal,
    } = useAssetForm({
        item: tableItem,
        state,
        operation,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
    });

    const formInputs = () => <FormInputs inputs={inputs} />;

    const createFixedIncomeTypeModalProps = useFixedIncomeTypeForm({
        state,
        operation: 'create',
        onSubmitCreate: data => {
            onSubmitCreateFixedIncomeType(data);
            setShowCreateFixedIncomeTypeModal(false);
        },
    });

    const createSpvModalProps = useSpvForm({
        state,
        operation: 'create',
        onSubmitCreate: data => {
            onSubmitCreateSpv(data);
            setShowCreateSpvModal(false);
        },
    });

    const dependentTransactions = transactions
        .map((t, index) => ({
            ...t,
            txNumber: index + 1,
        }))
        .filter(t => t.fixedIncomeTransaction?.assetId === tableItem?.id);

    const dependentItemList = dependentTransactions.map(t => (
        <div key={t.id}>Transaction #{t.txNumber}</div>
    ));

    const dependentItemProps = {
        dependentItemName: 'transactions',
        dependentItemList,
    };

    return (
        <>
            <ItemDetails
                {...props}
                dependentItemProps={dependentItemProps}
                formInputs={formInputs}
                reset={reset}
                submit={submit}
            />
            {showCreateFixedIncomeTypeModal ? (
                <RWACreateItemModal
                    {...createFixedIncomeTypeModalProps}
                    itemName="Fixed Income Type"
                    onOpenChange={setShowCreateFixedIncomeTypeModal}
                    open={showCreateFixedIncomeTypeModal}
                    state={state}
                />
            ) : null}
            {showCreateSpvModal ? (
                <RWACreateItemModal
                    {...createSpvModalProps}
                    itemName="SPV"
                    onOpenChange={setShowCreateSpvModal}
                    open={showCreateSpvModal}
                    state={state}
                />
            ) : null}
        </>
    );
}

export const AssetDetails = memo(_AssetDetails);
