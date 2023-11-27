import { DeleteItemModal, DeleteItemModalProps } from './DeleteItemModal';
import { UpgradeDriveModal, UpgradeDriveModalProps } from './UpgradeDriveModal';

export type ModalType = keyof ModalPropsMapping;

export type Modals = {
    [K in ModalType]: React.ComponentType<ModalPropsMapping[K]>;
};

export interface ModalPropsMapping {
    deleteItem: DeleteItemModalProps;
    upgradeDrive: UpgradeDriveModalProps;
}

export const modals: Modals = {
    deleteItem: DeleteItemModal,
    upgradeDrive: UpgradeDriveModal,
};
