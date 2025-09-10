import { Icon } from "@powerhousedao/design-system";
import { type DocumentDriveDocument } from "document-drive";
import { getDriveSharingType } from "document-drive/server/utils";

export function DriveIcon({
  drive,
}: {
  drive: DocumentDriveDocument | undefined;
}) {
  const sharingType = drive ? getDriveSharingType(drive) : undefined;
  const driveIconSrc = drive?.state.global.icon;

  if (driveIconSrc) {
    return (
      <img src={driveIconSrc} alt={drive.header.name} height={32} width={32} />
    );
  }

  if (sharingType === "LOCAL") {
    return <Icon name="Hdd" size={32} />;
  }

  return <Icon name="Server" size={32} />;
}
