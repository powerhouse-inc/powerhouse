import { DeleteItemModal } from './DeleteItemModal';
import { UpgradeDriveModal } from './UpgradeDriveModal';

export const modals = {
    deleteItem: DeleteItemModal,
    upgradeDrive: UpgradeDriveModal,
} as const;

export type Modals = typeof modals;

export type ModalType = keyof Modals;

export type ModalPropsMapping = {
    [K in ModalType]: React.ComponentProps<Modals[K]>;
};
