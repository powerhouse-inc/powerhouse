import {
    FixedIncomeTypeDetailsProps,
    ItemDetails,
    getFixedIncomeAssets,
} from '@/rwa';
import { FormInputs } from '../../inputs/form-inputs';
import { useFixedIncomeTypeForm } from './useFixedIncomeTypeForm';

export function FixedIncomeTypeDetails(props: FixedIncomeTypeDetailsProps) {
    const { onCancel, onSubmitForm, item, operation, state } = props;

    const assets = getFixedIncomeAssets(state);

    const { submit, reset, inputs } = useFixedIncomeTypeForm({
        defaultValues: {
            name: item?.name,
        },
        state,
        operation,
        onSubmitForm,
    });

    const formInputs = () => <FormInputs inputs={inputs} />;

    const dependentAssets = assets.filter(
        asset => asset.fixedIncomeTypeId === item?.id,
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
        onCancel,
    };

    return <ItemDetails {...props} {...formProps} />;
}
