import { useSpvForm } from '../table/spvs/useSpvForm';
import {
    RWACreateItemModal,
    RWACreateItemModalProps,
} from './create-item-modal';

type Props = Omit<RWACreateItemModalProps, 'itemName' | 'defaultValues'>;
export const CreateSpvModal = (props: Props) => {
    const defaultValues = {};

    const useSpvFormReturn = useSpvForm({
        ...props,
        operation: 'create',
        defaultValues,
    });

    return (
        <RWACreateItemModal
            {...props}
            {...useSpvFormReturn}
            itemName="Fixed Income Type"
            defaultValues={defaultValues}
        />
    );
};
