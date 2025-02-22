import { AddDriveModal } from './AddDriveModal';
import { AddLocalDriveModal } from './AddLocalDriveModal';
import { AddRemoteDriveModal } from './AddRemoteDriveModal';
import { ConfirmationModal } from './ConfirmationModal';
import { CookiesPolicyModal } from './CookiesPolicyModal';
import { CreateDocumentModal } from './CreateDocumentModal';
import { DebugSettingsModal } from './DebugSettingsModal';
import { DeleteDriveModal } from './DeleteDriveModal';
import { DeleteItemModal } from './DeleteItemModal';
import { DisclaimerModal } from './DisclaimerModal';
import { DriveSettingsModal } from './DriveSettingsModal';
import { SettingsModal } from './SettingsModal';
import { UpgradeDriveModal } from './UpgradeDriveModal';

export const modals = {
    deleteItem: DeleteItemModal,
    upgradeDrive: UpgradeDriveModal,
    createDocument: CreateDocumentModal,
    addDriveModal: AddDriveModal,
    addLocalDrive: AddLocalDriveModal,
    addRemoteDrive: AddRemoteDriveModal,
    driveSettings: DriveSettingsModal,
    settingsModal: SettingsModal,
    confirmationModal: ConfirmationModal,
    deleteDriveModal: DeleteDriveModal,
    debugSettingsModal: DebugSettingsModal,
    disclaimerModal: DisclaimerModal,
    cookiesPolicy: CookiesPolicyModal,
} as const;

export type Modals = typeof modals;

export type ModalType = keyof Modals;

export type ModalPropsMapping = {
    [K in ModalType]: React.ComponentProps<Modals[K]>;
};
