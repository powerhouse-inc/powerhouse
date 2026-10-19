import { Icon } from "@powerhousedao/design-system";
import { useConnectBranding } from "@powerhousedao/design-system/connect";
import {
  DriveCollectionId,
  useSyncList,
  useTheme,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { useMemo, useState } from "react";

export function DriveIcon({
  drive,
}: {
  drive: DocumentDriveDocument | undefined;
}) {
  const remotes = useSyncList();
  const { theme } = useTheme();
  const branding = useConnectBranding();
  const isRemoteDrive = useMemo(() => {
    if (!drive) return false;

    return remotes.some((remote) =>
      remote.meta.collectionId.equals(
        DriveCollectionId.forDrive(drive.header.id),
      ),
    );
  }, [remotes, drive]);

  const driveIconSrc = drive?.state.global.icon;
  // A drive's icon is an arbitrary URL stored in its state, so it can rot:
  // the host goes away, the gateway starts refusing, the CID is unpinned.
  // Rendering the <img> anyway leaves a browser's broken-image glyph in the
  // sidebar forever, because the dead URL is baked into the document and no
  // later fix to whoever wrote it can reach the drives already created.
  //
  // The failure is remembered as the src that failed rather than a flag, so a
  // drive whose icon later changes retries on its own - no effect needed to
  // reset it.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (driveIconSrc && driveIconSrc !== failedSrc) {
    // An icon is its own document once the browser renders it, so it cannot
    // see the `.dark` class the theme toggles on the host page. Propagating
    // the resolved theme as a color scheme is what lets an icon drawn against
    // `prefers-color-scheme` follow an explicit in-app choice rather than only
    // the OS preference.
    return (
      <img
        src={driveIconSrc}
        alt={drive.header.name}
        height={32}
        width={32}
        style={{ colorScheme: theme }}
        onError={() => setFailedSrc(driveIconSrc)}
      />
    );
  }

  // A drive without an icon of its own takes the branding's local/remote
  // drive icon (connect.branding.icons), else the built-in one.
  const fallbackSrc = isRemoteDrive
    ? branding.icons?.remoteDrive
    : branding.icons?.localDrive;
  if (fallbackSrc && fallbackSrc !== failedSrc) {
    return (
      <img
        src={fallbackSrc}
        alt={drive?.header.name ?? ""}
        height={32}
        width={32}
        className="object-contain"
        onError={() => setFailedSrc(fallbackSrc)}
      />
    );
  }

  if (!isRemoteDrive) {
    return <Icon name="Hdd" size={32} />;
  }

  return <Icon name="Server" size={32} />;
}
