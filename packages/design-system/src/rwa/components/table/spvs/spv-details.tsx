import {
    FormInputs,
    ItemDetails,
    ItemDetailsProps,
    SPV,
    SPVFormInputs,
    getFixedIncomeAssets,
    useSpvForm,
} from '@/rwa';

export function SPVDetails(props: ItemDetailsProps<SPV, SPVFormInputs>) {
    const {
        state,
        tableItem,
        operation,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
    } = props;

    const assets = getFixedIncomeAssets(state);

    const { submit, reset, inputs } = useSpvForm({
        item: tableItem,
        state,
        operation,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
    });

    const formInputs = () => <FormInputs inputs={inputs} />;

    const dependentAssets = assets.filter(
        asset => asset.spvId === tableItem?.id,
    );

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
    };

    return <ItemDetails {...props} {...formProps} />;
}
