import { AddDriveModal } from './modals/AddDriveModal';
import { AddLocalDriveModal } from './modals/AddLocalDriveModal';
import { AddRemoteDriveModal } from './modals/AddRemoteDriveModal';
import { ConfirmationModal } from './modals/ConfirmationModal';
import { CookiesPolicyModal } from './modals/CookiesPolicyModal';
import { CreateDocumentModal } from './modals/CreateDocumentModal';
import { DebugSettingsModal } from './modals/DebugSettingsModal';
import { DeleteDriveModal } from './modals/DeleteDriveModal';
import { DeleteItemModal } from './modals/DeleteItemModal';
import { DisclaimerModal } from './modals/DisclaimerModal';
import { DriveSettingsModal } from './modals/DriveSettingsModal';
import { SettingsModal } from './modals/SettingsModal';
import { UpgradeDriveModal } from './modals/UpgradeDriveModal';
export function ModalsContainer() {
    return (
        <>
            <DeleteItemModal />
            <UpgradeDriveModal />
            <CreateDocumentModal />
            <AddDriveModal />
            <AddLocalDriveModal />
            <AddRemoteDriveModal />
            <DriveSettingsModal />
            <SettingsModal />
            <ConfirmationModal />
            <DeleteDriveModal />
            <DebugSettingsModal />
            <DisclaimerModal />
            <CookiesPolicyModal />
        </>
    );
}
