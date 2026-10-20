import {
  getDriveName,
  makeDriveSlug,
  preloadDrive,
  useAppModuleById,
  useDrives,
  useLinkProps,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  formatModified,
  IndexRow,
  IndexTable,
  linkClass,
} from "./index-table.js";

function DriveRow({ drive }: { drive: DocumentDriveDocument }) {
  const app = useAppModuleById(drive.header.meta?.preferredEditor);
  const link = useLinkProps({ driveSlug: makeDriveSlug(drive) });
  return (
    <IndexRow
      name={
        <a
          {...link}
          className={linkClass}
          onMouseEnter={() => {
            link.onMouseEnter();
            preloadDrive(drive);
          }}
        >
          {getDriveName(drive)}/
        </a>
      }
      type={app?.config.name ?? "Drive"}
      modified={formatModified(drive.header.lastModifiedAtUtcIso)}
    />
  );
}

/** Core's home: an index of the drives. */
export function DriveIndex() {
  const drives = useDrives();
  // Empty until the reactor lists its drives, e.g. in the prerendered shell.
  if (!drives) return null;
  return (
    <IndexTable title="Index of /" label="Drives">
      {drives.map((drive) => (
        <DriveRow key={drive.header.id} drive={drive} />
      ))}
      {!drives.length && (
        <tr>
          <td colSpan={3} className="py-2 text-core-muted">
            No drives yet.
          </td>
        </tr>
      )}
    </IndexTable>
  );
}
