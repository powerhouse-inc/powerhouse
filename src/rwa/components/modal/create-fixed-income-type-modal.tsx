import { useFixedIncomeTypeForm } from '../table/fixed-income-types/useFixedIncomeTypeForm';
import {
    RWACreateItemModal,
    RWACreateItemModalProps,
} from './create-item-modal';

type Props = Omit<RWACreateItemModalProps, 'itemName' | 'defaultValues'>;
export const CreateFixedIncomeTypeModal = (props: Props) => {
    const defaultValues = {};

    const useFixedIncomeTypeFormReturn = useFixedIncomeTypeForm({
        ...props,
        operation: 'create',
        defaultValues,
    });

    return (
        <RWACreateItemModal
            {...props}
            {...useFixedIncomeTypeFormReturn}
            itemName="Fixed Income Type"
            defaultValues={defaultValues}
        />
    );
};
