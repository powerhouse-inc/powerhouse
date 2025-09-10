import connectConfig from "#connect-config";
import {
  CLOUD,
  debugNodeOptions,
  defaultDriveOptions,
  defaultFileOptions,
  defaultFolderOptions,
  DELETE,
  DRIVE,
  FILE,
  FOLDER,
  LOCAL,
  PUBLIC,
} from "@powerhousedao/design-system";
import type { SharingType } from "document-drive";
import type { ReactNode } from "react";

type AllNodeOptions =
  | (typeof debugNodeOptions)[number]
  | (typeof defaultDriveOptions)[number]
  | (typeof defaultFileOptions)[number]
  | (typeof defaultFolderOptions)[number];

// Enables debug options for the drive
const connectDebug = localStorage.getItem("CONNECT_DEBUG") === "true";

const DriveSections: {
  sharingType: SharingType;
  label: ReactNode;
}[] = [
  { sharingType: PUBLIC, label: "Public Drives" },
  { sharingType: CLOUD, label: "Secure Cloud Drives" },
  { sharingType: LOCAL, label: "My Local Drives" },
] as const;

const getSectionConfig = (sharingType: SharingType) => {
  return connectConfig.drives.sections[sharingType];
};

export function getDriveNodeOptions(sharingType: SharingType) {
  const options: AllNodeOptions[] = [...defaultDriveOptions];

  if (connectConfig.drives.sections[sharingType].allowDelete) {
    options.push(DELETE);
  }

  if (connectDebug) {
    options.push(...debugNodeOptions);
  }

  return options;
}

export function getFileNodeOptions() {
  const options: AllNodeOptions[] = [...defaultFileOptions];

  if (connectDebug) {
    options.push(...debugNodeOptions);
  }

  return options;
}

export function getFolderNodeOptions() {
  const options: AllNodeOptions[] = [...defaultFolderOptions];

  if (connectDebug) {
    options.push(...debugNodeOptions);
  }

  return options;
}

export function getNodeOptions() {
  return {
    [LOCAL]: {
      [DRIVE]: getDriveNodeOptions(LOCAL),
      [FOLDER]: getFolderNodeOptions(),
      [FILE]: getFileNodeOptions(),
    },
    [CLOUD]: {
      [DRIVE]: getDriveNodeOptions(CLOUD),
      [FOLDER]: getFolderNodeOptions(),
      [FILE]: getFileNodeOptions(),
    },
    [PUBLIC]: {
      [DRIVE]: getDriveNodeOptions(PUBLIC),
      [FOLDER]: getFolderNodeOptions(),
      [FILE]: getFileNodeOptions(),
    },
  } as const;
}

export const driveSections = DriveSections.filter(
  (section) => getSectionConfig(section.sharingType).enabled,
).map((section) => {
  const sectionConfig = getSectionConfig(section.sharingType);

  return {
    ...section,
    disableAddDrives: !sectionConfig.allowAdd,
  };
});
