import { useAccountForm } from '../table/accounts/useAccountForm';
import {
    RWACreateItemModal,
    RWACreateItemModalProps,
} from './create-item-modal';

type Props = Omit<RWACreateItemModalProps, 'itemName' | 'defaultValues'>;
export const CreateAccountModal = (props: Props) => {
    const defaultValues = {};

    const useAccountFormReturn = useAccountForm({
        ...props,
        operation: 'create',
        defaultValues,
    });

    return (
        <RWACreateItemModal
            {...props}
            {...useAccountFormReturn}
            itemName="Account"
            defaultValues={defaultValues}
        />
    );
};
