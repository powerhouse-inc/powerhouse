import {
    AssetDetailsProps,
    ItemDetails,
    convertToDateTimeLocalFormat,
} from '@/rwa';
import { FormInputs } from '../../inputs/form-inputs';
import { CreateFixedIncomeTypeModal } from '../../modal/create-fixed-income-type-modal';
import { useFixedIncomeTypeForm } from '../fixed-income-types/useFixedIncomeTypeForm';
import { useSpvForm } from '../spvs/useSpvForm';
import { useAssetForm } from './useAssetForm';

export function AssetDetails(props: AssetDetailsProps) {
    const {
        state,
        onCancel,
        onSubmitForm,
        onSubmitCreateFixedIncomeType,
        onSubmitCreateSpv,
        item,
        operation,
    } = props;

    const { fixedIncomeTypes, spvs, transactions } = state;

    const fixedIncomeType = fixedIncomeTypes.find(
        ({ id }) => id === item?.fixedIncomeTypeId,
    );
    const spv = spvs.find(({ id }) => id === item?.spvId);

    const defaultValues = {
        fixedIncomeTypeId: fixedIncomeType?.id ?? fixedIncomeTypes[0]?.id,
        spvId: spv?.id ?? spvs[0]?.id,
        name: item?.name,
        maturity: convertToDateTimeLocalFormat(item?.maturity ?? new Date()),
        ISIN: item?.ISIN,
        CUSIP: item?.CUSIP,
        coupon: item?.coupon,
    };

    const {
        submit,
        reset,
        inputs,
        showCreateFixedIncomeTypeModal,
        setShowCreateFixedIncomeTypeModal,
        showCreateSpvModal,
        setShowCreateSpvModal,
    } = useAssetForm({
        item,
        defaultValues,
        state,
        onSubmitForm,
        operation,
    });

    const formInputs = () => <FormInputs inputs={inputs} />;

    const createFixedIncomeTypeModalProps = useFixedIncomeTypeForm({
        defaultValues: {},
        state,
        operation: 'create',
        onSubmitForm: data => {
            onSubmitCreateFixedIncomeType(data);
            setShowCreateFixedIncomeTypeModal(false);
        },
    });

    const createSpvModalProps = useSpvForm({
        defaultValues: {},
        state,
        operation: 'create',
        onSubmitForm: data => {
            onSubmitCreateSpv(data);
            setShowCreateSpvModal(false);
        },
    });

    const dependentTransactions = transactions
        .map((t, index) => ({
            ...t,
            txNumber: index + 1,
        }))
        .filter(t => t.fixedIncomeTransaction?.assetId === item?.id);

    const dependentItemList = dependentTransactions.map(t => (
        <div key={t.id}>Transaction #{t.txNumber}</div>
    ));

    const dependentItemProps = {
        dependentItemName: 'transactions',
        dependentItemList,
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
            {showCreateFixedIncomeTypeModal && (
                <CreateFixedIncomeTypeModal
                    {...createFixedIncomeTypeModalProps}
                    state={state}
                    onOpenChange={setShowCreateFixedIncomeTypeModal}
                    open={showCreateFixedIncomeTypeModal}
                />
            )}
            {showCreateSpvModal && (
                <CreateFixedIncomeTypeModal
                    {...createSpvModalProps}
                    state={state}
                    onOpenChange={setShowCreateSpvModal}
                    open={showCreateSpvModal}
                />
            )}
        </>
    );
}
