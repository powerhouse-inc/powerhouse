import { useServiceProviderFeeTypeForm } from '../table/service-provider-fee-types/useServiceProviderFeeTypeForm';
import {
    RWACreateItemModal,
    RWACreateItemModalProps,
} from './create-item-modal';

type Props = Omit<RWACreateItemModalProps, 'itemName' | 'defaultValues'>;

export const CreateServiceProviderFeeTypeModal = (props: Props) => {
    const { state, onSubmitForm } = props;

    const { accounts } = state;

    const defaultValues = {
        accountId: accounts[0]?.id,
    };

    const useServiceProviderFeeTypeFormReturn = useServiceProviderFeeTypeForm({
        state,
        onSubmitForm,
        defaultValues,
        operation: 'create',
    });

    return (
        <RWACreateItemModal
            {...props}
            {...useServiceProviderFeeTypeFormReturn}
            itemName="Service Provider Fee Type"
            defaultValues={defaultValues}
        />
    );
};
