import type {
  AddLocalDriveInput,
  AddRemoteDriveInput,
} from "@powerhousedao/design-system";
import {
  AddDriveModal as ConnectAddLocalDriveModal,
  toast,
} from "@powerhousedao/design-system";
import {
  addDrive,
  addRemoteDrive,
  closePHModal,
  setSelectedDrive,
  useConnectCrypto,
  useDriveEditorModules,
  usePHModal,
  useUser,
} from "@powerhousedao/reactor-browser";
import { requestPublicDrive } from "document-drive";
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
          const authToken = await connectCrypto?.getBearerToken?.(
            url,
            user?.address,
            true,
            { expiresIn: 10 },
          );
          return requestPublicDrive(url, {
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
          return requestPublicDrive(url, {
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
