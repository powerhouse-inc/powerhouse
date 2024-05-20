import { convertToDateTimeLocalFormat } from '@/rwa/utils';
import { useAssetForm } from '../table/assets/useAssetForm';
import {
    RWACreateItemModal,
    RWACreateItemModalProps,
} from './create-item-modal';

type Props = Omit<RWACreateItemModalProps, 'itemName' | 'defaultValues'>;
export const CreateAssetModal = (props: Props) => {
    const { fixedIncomeTypes, spvs } = props.state;

    const defaultValues = {
        fixedIncomeTypeId: fixedIncomeTypes[0]?.id,
        spvId: spvs[0]?.id,
        maturity: convertToDateTimeLocalFormat(new Date()),
    };

    const useAssetFormReturn = useAssetForm({
        ...props,
        defaultValues,
        operation: 'create',
    });

    return (
        <RWACreateItemModal
            {...props}
            {...useAssetFormReturn}
            itemName="Asset"
            defaultValues={defaultValues}
        />
    );
};
