import { toast } from "@powerhousedao/connect/services";
import type {
  AddLocalDriveInput,
  AddRemoteDriveInput,
} from "@powerhousedao/design-system/connect";
import { AddDriveModal as ConnectAddLocalDriveModal } from "@powerhousedao/design-system/connect";
import {
  addDrive,
  addRemoteDrive,
  closePHModal,
  setSelectedDrive,
  useDriveEditorModules,
  usePHModal,
} from "@powerhousedao/reactor-browser";
import { useRenown, useUser } from "@powerhousedao/reactor-browser/connect";
import { requestPublicDriveFromReactor } from "document-drive";
import { t } from "i18next";

export function AddDriveModal() {
  const phModal = usePHModal();
  const open = phModal?.type === "addDrive";
  const user = useUser();
  const renown = useRenown();
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
      const driveId = await addRemoteDrive(data.url, {}, data.id);

      toast(t("notifications.addDriveSuccess"), {
        type: "connect-success",
      });

      setSelectedDrive(driveId);
    } catch (e) {
      console.error(e);
    }
  };
  async function onAddLocalDriveSubmit(data: AddLocalDriveInput) {
    await onAddLocalDrive(data);
    closePHModal();
  }

  async function onAddRemoteDriveSubmit(data: AddRemoteDriveInput) {
    await onAddRemoteDrive(data);
    closePHModal();
  }

  const ready = !!driveEditorModules?.length;

  return (
    <ConnectAddLocalDriveModal
      open={open && ready}
      onAddLocalDrive={onAddLocalDriveSubmit}
      onAddRemoteDrive={onAddRemoteDriveSubmit}
      requestPublicDrive={async (url: string) => {
        try {
          if (user) {
            const authToken = await renown?.getBearerToken?.({
              expiresIn: 10,
              aud: url,
            });
            return requestPublicDriveFromReactor(url, {
              Authorization: `Bearer ${authToken}`,
            });
          }
          return requestPublicDriveFromReactor(url);
        } catch (error) {
          console.error(error);
          return requestPublicDriveFromReactor(url);
        }
      }}
      onOpenChange={(status) => {
        if (!status) return closePHModal();
      }}
      appOptions={
        driveEditorModules?.map((pkg) => ({
          id: pkg.id,
          name: pkg.name,
          driveEditor: pkg.id,
        })) || []
      }
    />
  );
}
