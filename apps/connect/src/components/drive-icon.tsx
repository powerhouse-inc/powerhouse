import { Icon } from "@powerhousedao/design-system";
import { driveCollectionId } from "@powerhousedao/reactor";
import { useSyncList } from "@powerhousedao/reactor-browser/connect";
import type { DocumentDriveDocument } from "document-drive";
import { useMemo } from "react";

export function DriveIcon({
  drive,
}: {
  drive: DocumentDriveDocument | undefined;
}) {
  const { data: remotes = [] } = useSyncList();
  const isRemoteDrive = useMemo(() => {
    if (!drive) return false;

    return remotes.some(
      (remote) =>
        remote.collectionId === driveCollectionId("main", drive.header.id),
    );
  }, [remotes, drive]);

  const driveIconSrc = drive?.state.global.icon;

  if (driveIconSrc) {
    return (
      <img src={driveIconSrc} alt={drive.header.name} height={32} width={32} />
    );
  }

  if (!isRemoteDrive) {
    return <Icon name="Hdd" size={32} />;
  }

  return <Icon name="Server" size={32} />;
}
