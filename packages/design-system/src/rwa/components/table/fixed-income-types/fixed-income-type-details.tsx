import {
    FixedIncomeType,
    FixedIncomeTypeFormInputs,
    FormInputs,
    ItemDetails,
    ItemDetailsProps,
    getFixedIncomeAssets,
    useFixedIncomeTypeForm,
} from '@/rwa';
import { memo } from 'react';

export function _FixedIncomeTypeDetails(
    props: ItemDetailsProps<FixedIncomeType, FixedIncomeTypeFormInputs>,
) {
    const {
        state,
        tableItem,
        operation,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
    } = props;

    const assets = getFixedIncomeAssets(state);

    const { submit, reset, inputs } = useFixedIncomeTypeForm({
        item: tableItem,
        state,
        operation,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
    });

    const formInputs = () => <FormInputs inputs={inputs} />;

    const dependentAssets = assets.filter(
        asset => asset.fixedIncomeTypeId === tableItem?.id,
    );

    const dependentItemsList = dependentAssets.map(asset => (
        <div key={asset.id}>{asset.name}</div>
    ));

    const dependentItemProps = {
        dependentItemName: 'assets',
        dependentItemList: dependentItemsList,
    };

    const formProps = {
        formInputs,
        dependentItemProps,
        submit,
        reset,
    };

    return <ItemDetails {...props} {...formProps} />;
}

export const FixedIncomeTypeDetails = memo(_FixedIncomeTypeDetails);
