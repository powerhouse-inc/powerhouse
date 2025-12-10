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
  isLegacyWriteEnabledSync,
  setSelectedDrive,
  useDriveEditorModules,
  usePHModal,
} from "@powerhousedao/reactor-browser";
import {
  useConnectCrypto,
  useUser,
} from "@powerhousedao/reactor-browser/connect";
import {
  requestPublicDrive,
  requestPublicDriveFromReactor,
} from "document-drive";
import { t } from "i18next";

export function AddDriveModal() {
  const phModal = usePHModal();
  const open = phModal?.type === "addDrive";
  const user = useUser();
  const connectCrypto = useConnectCrypto();
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
      const useLegacy = isLegacyWriteEnabledSync();

      // Legacy path uses listeners/triggers, new path uses channel-based sync
      const newDrive = useLegacy
        ? await addRemoteDrive(data.url, {
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
          })
        : await addRemoteDrive(data.url, {});

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
        const useLegacy = isLegacyWriteEnabledSync();
        const requestFn = useLegacy
          ? requestPublicDrive
          : requestPublicDriveFromReactor;

        try {
          const authToken = await connectCrypto?.getBearerToken?.(
            url,
            user?.address,
            true,
            { expiresIn: 10 },
          );
          return requestFn(url, {
            Authorization: `Bearer ${authToken}`,
          });
        } catch (error) {
          console.error(error);
          const authToken = await connectCrypto?.getBearerToken?.(
            url,
            user?.address,
            true,
            { expiresIn: 10 },
          );
          return requestFn(url, {
            Authorization: `Bearer ${authToken}`,
          });
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
