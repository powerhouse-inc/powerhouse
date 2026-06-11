import { Icon } from "../../powerhouse/components/icon/icon.js";

export const defaultDriveOptions = [
  "NEW_FOLDER",
  "RENAME",
  "SETTINGS",
] as const;

export const defaultNodeOptions = ["RENAME", "DELETE", "DUPLICATE"] as const;

export const normalNodeOptions = [
  "DUPLICATE",
  "RENAME",
  "DELETE",
  "SETTINGS",
] as const;

export const debugNodeOptions = [
  "ADD_TRIGGER",
  "REMOVE_TRIGGER",
  "ADD_INVALID_TRIGGER",
] as const;

export const nodeOptions = [...normalNodeOptions, ...debugNodeOptions] as const;

export const sharingTypeOptions = [
  {
    value: "LOCAL",
    icon: <Icon name="Lock" size={16} />,
    description: "Only available to you",
  },
  {
    value: "CLOUD",
    icon: <Icon name="People" size={16} />,
    description: "Only available to people in this drive",
  },
  {
    value: "PUBLIC",
    icon: <Icon name="Globe" size={16} />,
    description: "Available to everyone",
    disabled: true,
  },
] as const;

export const locationInfoByLocation = {
  CLOUD: {
    title: "Secure cloud",
    description: "End to end encryption between members.",
    icon: <Icon name="Lock" size={16} />,
  },
  LOCAL: {
    title: "Local",
    description: "Private and only available to you.",
    icon: <Icon name="Hdd" size={16} />,
  },
  SWITCHBOARD: {
    title: "Switchboard",
    description: "Public and available to everyone.",
    icon: <Icon name="Drive" size={16} />,
  },
} as const;

export const debugNodeOptionsMap = {
  ADD_TRIGGER: {
    label: "Add Trigger",
    icon: (
      <Icon
        className="text-orange-900 dark:text-orange-100"
        name="Plus"
        size={16}
      />
    ),
  },
  REMOVE_TRIGGER: {
    label: "Remove Trigger",
    icon: (
      <Icon
        className="text-orange-900 dark:text-orange-100"
        name="Xmark"
        size={16}
      />
    ),
  },
  ADD_INVALID_TRIGGER: {
    label: "Add Trigger",
    icon: (
      <Icon
        className="text-orange-900 dark:text-orange-100"
        name="Exclamation"
        size={16}
      />
    ),
  },
} as const;

export const folderNodeDropdownOptions = {
  DUPLICATE: {
    label: "Duplicate",
    icon: <Icon name="FilesEarmark" size={16} />,
  },
  RENAME: {
    label: "Rename",
    icon: <Icon name="Pencil" size={16} />,
  },
  DELETE: {
    label: "Delete",
    icon: <Icon name="Trash" size={16} />,
    className: "text-red-900 dark:text-red-500",
  },
} as const;

export const fileNodeDropdownOptions = {
  DOWNLOAD: {
    label: "Download",
    icon: <Icon name="DownloadFile" size={16} />,
  },
  ...folderNodeDropdownOptions,
};
