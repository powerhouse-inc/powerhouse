import { toast } from "@powerhousedao/connect/services";
import type {
  AddRemoteDriveInput,
  AppOptions,
} from "@powerhousedao/design-system/connect";
import { AddDriveModal as ConnectAddLocalDriveModal } from "@powerhousedao/design-system/connect";
import {
  addDrive,
  addRemoteDrive,
  closePHModal,
  extractDriveSlugFromPath,
  getDrives,
  setSelectedDrive,
  useAppModules,
  usePHModal,
  useRenown,
  useUser,
  waitForDocumentReady,
} from "@powerhousedao/reactor-browser";
import { t } from "i18next";
import { getCreateDriveAppOptions } from "../../../utils/create-drive-app-options.js";

// Max wait for a remote drive's initial sync before skipping navigation.
// Safe to be generous: navigation only fires if the user is still on home.
const REMOTE_DRIVE_NAV_TIMEOUT_MS = 30_000;

async function requestPublicDriveFromReactor(
  url: string,
  headers?: Record<string, string>,
): Promise<{ id: string; name: string }> {
  const response = await fetch(url, { headers: headers ?? {} });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as { id: string; name: string };
}

export function AddDriveModal() {
  const phModal = usePHModal();
  const open = phModal?.type === "addDrive";
  const user = useUser();
  const renown = useRenown();
  const appModules = useAppModules();
  const onAddLocalDrive = async (data: AppOptions) => {
    try {
      const app = appModules?.find((a) => a.config.id === data.id);
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
        app?.config.id,
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
      const driveId = await addRemoteDrive(data.url, data.id);

      toast(t("notifications.addDriveSuccess"), {
        type: "connect-success",
      });

      // Navigate into the drive if its initial sync lands in time.
      // Not awaited so the modal closes immediately.
      const reactorClient = window.ph?.reactorClient;
      // Only a still unselected, un-pinned (home) view gets pulled into the
      // new drive — the user may have navigated elsewhere meanwhile.
      const stillOnHome = () =>
        !window.ph?.selectedDriveId &&
        !extractDriveSlugFromPath(window.location.pathname);
      void (async () => {
        try {
          if (!reactorClient) {
            return;
          }
          await waitForDocumentReady(reactorClient, driveId, {
            timeoutMs: REMOTE_DRIVE_NAV_TIMEOUT_MS,
          });
          const drives = await getDrives(reactorClient);
          const drive = drives.find((d) => d.header.id === driveId);
          if (drive && stillOnHome()) {
            setSelectedDrive(drive);
          }
        } catch {
          // sync still in flight — the drive shows up on home once it lands
        }
      })();
    } catch (e) {
      console.error(e);
    }
  };
  async function onAddLocalDriveSubmit(data: AppOptions) {
    await onAddLocalDrive(data);
    closePHModal();
  }

  async function onAddRemoteDriveSubmit(data: AddRemoteDriveInput) {
    await onAddRemoteDrive(data);
    closePHModal();
  }

  const ready = !!appModules?.length;

  return (
    <ConnectAddLocalDriveModal
      open={open && ready}
      onAddLocalDrive={(data) => {
        void onAddLocalDriveSubmit(data);
      }}
      onAddRemoteDrive={(data) => {
        void onAddRemoteDriveSubmit(data);
      }}
      requestPublicDrive={async (url: string) => {
        try {
          if (user) {
            // aud omitted: server verifies without an audience, so aud-bearing
            // tokens are rejected. Re-enable once both sides support it.
            const authToken = await renown?.getBearerToken?.({
              expiresIn: 10,
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
      appOptions={getCreateDriveAppOptions(appModules)}
    />
  );
}
