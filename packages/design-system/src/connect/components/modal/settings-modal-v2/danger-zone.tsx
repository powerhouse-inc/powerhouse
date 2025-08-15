import { Icon } from "#powerhouse";
import { cn } from "#ui";
import { capitalCase } from "change-case";
import { type DocumentDriveDocument, type SharingType } from "document-drive";
import { useState } from "react";
import { CLOUD, PUBLIC } from "../../../constants/drives.js";
import { ConnectDropdownMenu } from "../../dropdown-menu/dropdown-menu.js";

type ModifyDrivesProps = {
  drives: DocumentDriveDocument[];
  onDeleteDrive: (drive: DocumentDriveDocument) => void;
  className?: string;
};

type LocalStorageProps = {
  onClearStorage: () => void | Promise<void>;
  className?: string;
};

type Props = ModifyDrivesProps & LocalStorageProps;

export function DangerZone(props: Props) {
  const { className, ...rest } = props;
  return (
    <div className={cn("h-full rounded-lg bg-white p-3", className)}>
      <h2 className="mb-4 font-semibold">Modify Drives</h2>
      <ModifyDrives {...rest} />
      <h2 className="my-4 font-semibold">Local Storage</h2>
      <LocalStorage {...rest} />
    </div>
  );
}

function ModifyDrives(props: ModifyDrivesProps) {
  const { className, ...rest } = props;
  return (
    <div className={className}>
      <DriveList {...rest} />
    </div>
  );
}

function DriveList(props: ModifyDrivesProps) {
  const { className, ...rest } = props;
  return (
    <div className={className}>
      {props.drives.map((drive) => (
        <Drive key={drive.header.id} drive={drive} {...rest} />
      ))}
    </div>
  );
}

function Drive(props: ModifyDrivesProps & { drive: DocumentDriveDocument }) {
  const { drive, className, onDeleteDrive } = props;
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
  const localDriveIcon = <Icon name="Hdd" size={16} className="flex-none" />;

  const cloudDriveIcon = <Icon name="Server" size={16} className="flex-none" />;

  const publicDriveIcon = drive.state.global.icon ? (
    <img
      alt="drive icon"
      className="size-4 flex-none object-contain"
      src={drive.state.global.icon}
    />
  ) : (
    <Icon name="M" size={16} className="flex-none" />
  );

  function getDriveSharingType(
    drive:
      | {
          state: {
            local: {
              sharingType?: string | null;
            };
          };
          readContext?: {
            sharingType?: string | null;
          };
        }
      | undefined
      | null,
  ) {
    if (!drive) return "PUBLIC";
    const isReadDrive = "readContext" in drive;
    const { sharingType: _sharingType } = !isReadDrive
      ? drive.state.local
      : { sharingType: "PUBLIC" };
    const __sharingType = _sharingType?.toUpperCase();
    return (
      __sharingType === "PRIVATE" ? "LOCAL" : __sharingType
    ) as SharingType;
  }

  function getNodeIcon() {
    const sharingType = getDriveSharingType(drive);
    if (sharingType === PUBLIC) {
      return publicDriveIcon;
    }
    if (sharingType === CLOUD) {
      return cloudDriveIcon;
    }
    return localDriveIcon;
  }

  const icon = getNodeIcon();

  return (
    <div
      className={cn(
        "mb-4 flex w-96 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 shadow-sm last-of-type:mb-0",
        className,
      )}
    >
      {icon}
      <div>
        <span className="block text-sm font-medium leading-[18px]">
          {capitalCase(drive.header.name)}
        </span>
        <div className="flex items-baseline gap-x-2 leading-[18px]">
          <span className="text-sm text-gray-600">
            {capitalCase(getDriveSharingType(drive))} App
          </span>
          <a className="group flex items-center gap-x-2 text-sm text-slate-500 transition-colors hover:text-[#9896FF]">
            By Powerhouse
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 12 12"
              className="size-4 text-gray-400 transition-colors group-hover:text-inherit"
            >
              <path
                d="M7.99365 11.9939C9.46632 11.9939 10.6603 10.7999 10.6603 9.32722V7.32722C10.6603 6.95922 10.3617 6.66056 9.99365 6.66056C9.62565 6.66056 9.32699 6.95922 9.32699 7.32722V9.32722C9.32699 10.0639 8.73032 10.6606 7.99365 10.6606H2.66032C1.92365 10.6606 1.32699 10.0639 1.32699 9.32722V3.99389C1.32699 3.25723 1.92365 2.66056 2.66032 2.66056H4.66032C5.02832 2.66056 5.32699 2.36189 5.32699 1.99389C5.32699 1.6259 5.02832 1.32723 4.66032 1.32723H2.66032C1.18765 1.32723 -0.00634766 2.52123 -0.00634766 3.99389V9.32722C-0.00634766 10.7999 1.18765 11.9939 2.66032 11.9939H7.99365ZM5.32699 7.32722C5.49765 7.32722 5.67565 7.26989 5.80632 7.13989L10.1396 2.80656L11.9937 4.66056V-0.00610352H7.32699L9.18099 1.8479L4.84766 6.18123C4.58766 6.4419 4.58766 6.87922 4.84766 7.13989C4.97832 7.26989 5.15632 7.32722 5.32699 7.32722Z"
                fill="currentColor"
              />
            </svg>
          </a>
        </div>
      </div>
      <ConnectDropdownMenu
        items={[
          {
            id: "delete-drive",
            label: "Delete",
            icon: <Icon name="Trash" />,
            className: "text-red-900",
          },
        ]}
        onItemClick={(id) => {
          if (id === "delete-drive") {
            onDeleteDrive(drive);
          }
        }}
        onOpenChange={setIsDropdownMenuOpen}
        open={isDropdownMenuOpen}
      >
        <button
          className="group ml-auto flex-none"
          onClick={(e) => {
            e.stopPropagation();
            setIsDropdownMenuOpen(true);
          }}
        >
          <Icon
            className="text-gray-600 group-hover:text-gray-900"
            name="VerticalDots"
            size={16}
          />
        </button>
      </ConnectDropdownMenu>
    </div>
  );
}

function LocalStorage(props: LocalStorageProps) {
  const { onClearStorage } = props;
  return (
    <div>
      <button
        className="flex items-center gap-x-2 rounded-md border border-gray-300 bg-transparent px-3 py-1 text-sm font-medium text-red-900 transition-colors hover:bg-gray-100"
        onClick={onClearStorage}
      >
        Clear Storage <Icon name="Trash" size={16} />
      </button>
    </div>
  );
}
