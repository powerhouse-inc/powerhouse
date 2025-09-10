import { useModal } from "#components";
import type {
  AddLocalDriveInput,
  AddRemoteDriveInput,
} from "@powerhousedao/design-system";
import { toast } from "@powerhousedao/design-system";
import {
  addDrive,
  addRemoteDrive,
  deleteDrive,
  deleteNode,
  renameDrive,
  setDriveAvailableOffline,
  setDriveSharingType,
  setSelectedDrive,
  setSelectedNode,
  useDriveEditorModules,
  useDrives,
  useSelectedDrive,
  useSelectedParentFolder,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument, Node, SharingType } from "document-drive";
import { t } from "i18next";
import { useCallback } from "react";

export function useShowAddDriveModal() {
  const { showModal } = useModal();
  const driveEditorModules = useDriveEditorModules();
  const onAddLocalDrive = async (data: AddLocalDriveInput) => {
    try {
      const app = driveEditorModules?.find((a) => a.id === data.appId);
      const newDrive = await addDrive(
        {
          id: "",
          slug: "",
          global: {
            name: data.name,
            icon: null,
          },
          local: {
            availableOffline: data.availableOffline,
            sharingType: data.sharingType.toLowerCase(),
            listeners: [],
            triggers: [],
          },
        },
        app?.id,
      );

      toast(t("notifications.addDriveSuccess"), {
        type: "connect-success",
      });

      if (!newDrive) {
        return;
      }

      setSelectedDrive(newDrive);
    } catch (e) {
      console.error(e);
    }
  };

  const onAddRemoteDrive = async (data: AddRemoteDriveInput) => {
    try {
      const newDrive = await addRemoteDrive(data.url, {
        sharingType: data.sharingType,
        availableOffline: data.availableOffline,
        listeners: [
          {
            block: true,
            callInfo: {
              data: data.url,
              name: "switchboard-push",
              transmitterType: "SwitchboardPush",
            },
            filter: {
              branch: ["main"],
              documentId: ["*"],
              documentType: ["*"],
              scope: ["global"],
            },
            label: "Switchboard Sync",
            listenerId: "1",
            system: true,
          },
        ],
        triggers: [],
      });

      toast(t("notifications.addDriveSuccess"), {
        type: "connect-success",
      });

      if (!newDrive) {
        return;
      }

      setSelectedDrive(newDrive);
    } catch (e) {
      console.error(e);
    }
  };

  const showAddDriveModal = () => {
    showModal("addDriveModal", {
      onAddLocalDrive,
      onAddRemoteDrive,
    });
  };

  return showAddDriveModal;
}

export function useShowDriveSettingsModal() {
  const { showModal } = useModal();
  const drives = useDrives();
  const onRenameDrive = useCallback(
    async (drive: DocumentDriveDocument, newName: string) => {
      await renameDrive(drive.header.id, newName);
    },
    [renameDrive],
  );

  const onChangeSharingType = useCallback(
    async (drive: DocumentDriveDocument, newSharingType: SharingType) => {
      await setDriveSharingType(drive.header.id, newSharingType);
    },
    [setDriveSharingType],
  );

  const onChangeAvailableOffline = useCallback(
    async (drive: DocumentDriveDocument, newAvailableOffline: boolean) => {
      await setDriveAvailableOffline(drive.header.id, newAvailableOffline);
    },
    [setDriveAvailableOffline],
  );
  const onDeleteDrive = useCallback(
    (drive: DocumentDriveDocument) => {
      showModal("deleteDriveModal", {
        drive,
        onDelete: async (closeModal) => {
          closeModal();
          await deleteDrive(drive.header.id);

          setSelectedDrive(drives?.[0]);

          toast(t("notifications.deleteDriveSuccess"), {
            type: "connect-deleted",
          });
        },
      });
    },
    [deleteDrive, drives, showModal, t],
  );
  const showDriveSettingsModal = useCallback(
    (drive: DocumentDriveDocument) => {
      showModal("driveSettings", {
        drive,
        onRenameDrive,
        onDeleteDrive,
        onChangeSharingType,
        onChangeAvailableOffline,
      });
    },
    [
      onChangeAvailableOffline,
      onChangeSharingType,
      onDeleteDrive,
      onRenameDrive,
      showModal,
    ],
  );

  return showDriveSettingsModal;
}

export function useShowDeleteNodeModal() {
  const { showModal } = useModal();
  const [selectedDrive] = useSelectedDrive();
  const selectedParentFolder = useSelectedParentFolder();
  const showDeleteNodeModal = useCallback(
    (node: Node) => {
      showModal("deleteItem", {
        id: node.id,
        onDelete: async (closeModal) => {
          if (!selectedDrive?.header.id) {
            return;
          }
          closeModal();

          const i18nKey =
            node.kind === "folder"
              ? "notifications.deleteFolderSuccess"
              : "notifications.fileDeleteSuccess";

          await deleteNode(selectedDrive.header.id, node.id);

          setSelectedNode(selectedParentFolder);

          toast(t(i18nKey), { type: "connect-deleted" });
        },
      });
    },
    [
      deleteNode,
      selectedDrive?.header.id,
      selectedParentFolder?.id,
      setSelectedNode,
      showModal,
      t,
    ],
  );

  return showDeleteNodeModal;
}
