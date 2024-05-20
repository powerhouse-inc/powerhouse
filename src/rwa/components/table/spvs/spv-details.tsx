import { ItemDetails, SPVDetailsProps, getFixedIncomeAssets } from '@/rwa';
import { FormInputs } from '../../inputs/form-inputs';
import { useSpvForm } from './useSpvForm';

export function SPVDetails(props: SPVDetailsProps) {
    const { onCancel, onSubmitForm, item, operation, state } = props;

    const assets = getFixedIncomeAssets(state);

    const { submit, reset, inputs } = useSpvForm({
        defaultValues: {
            name: item?.name,
        },
        state,
        operation,
        onSubmitForm,
    });

    const formInputs = () => <FormInputs inputs={inputs} />;

    const dependentAssets = assets.filter(asset => asset.spvId === item?.id);

    const dependentItemProps = {
        dependentItemName: 'assets',
        dependentItemList: dependentAssets.map(asset => (
            <div key={asset.id}>{asset.name}</div>
        )),
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
