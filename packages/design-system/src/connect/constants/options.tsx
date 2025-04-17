import {
  CLOUD,
  type DebugNodeOption,
  LOCAL,
  type NodeOption,
  type NormalNodeOption,
  type OptionMetadata,
  PUBLIC,
} from "#connect";
import { Icon } from "#powerhouse";

export const NEW = "NEW";
export const DUPLICATE = "DUPLICATE";
export const NEW_FOLDER = "NEW_FOLDER";
export const RENAME = "RENAME";
export const DELETE = "DELETE";
export const SETTINGS = "SETTINGS";
export const REMOVE_TRIGGER = "REMOVE_TRIGGER";
export const ADD_TRIGGER = "ADD_TRIGGER";
export const ADD_INVALID_TRIGGER = "ADD_INVALID_TRIGGER";

export const defaultDriveOptions = [NEW_FOLDER, RENAME, SETTINGS] as const;

export const defaultFileOptions = [RENAME, DELETE, DUPLICATE] as const;

export const defaultFolderOptions = [
  NEW_FOLDER,
  RENAME,
  DELETE,
  DUPLICATE,
] as const;

export const normalNodeOptions = [DUPLICATE, RENAME, DELETE, SETTINGS] as const;

export const debugNodeOptions = [
  ADD_TRIGGER,
  REMOVE_TRIGGER,
  ADD_INVALID_TRIGGER,
] as const;

export const nodeOptions = [...normalNodeOptions, ...debugNodeOptions] as const;

export const sharingTypeOptions = [
  {
    value: LOCAL,
    icon: <Icon name="Lock" />,
    description: "Only available to you",
  },
  {
    value: CLOUD,
    icon: <Icon name="People" />,
    description: "Only available to people in this drive",
  },
  {
    value: PUBLIC,
    icon: <Icon name="Globe" />,
    description: "Available to everyone",
    disabled: true,
  },
] as const;

export const locationInfoByLocation = {
  CLOUD: {
    title: "Secure cloud",
    description: "End to end encryption between members.",
    icon: <Icon name="Lock" />,
  },
  LOCAL: {
    title: "Local",
    description: "Private and only available to you.",
    icon: <Icon name="Hdd" />,
  },
  SWITCHBOARD: {
    title: "Switchboard",
    description: "Public and available to everyone.",
    icon: <Icon name="Drive" />,
  },
} as const;

export const debugNodeOptionsMap: Record<DebugNodeOption, OptionMetadata> = {
  [ADD_TRIGGER]: {
    label: "Add Trigger",
    icon: <Icon className="text-orange-900" name="Plus" />,
  },
  [REMOVE_TRIGGER]: {
    label: "Remove Trigger",
    icon: <Icon className="text-orange-900" name="Xmark" />,
  },
  [ADD_INVALID_TRIGGER]: {
    label: "Add Trigger",
    icon: <Icon className="text-orange-900" name="Exclamation" />,
  },
} as const;

export const normalNodeOptionsMap: Record<NormalNodeOption, OptionMetadata> = {
  [DUPLICATE]: {
    label: "Duplicate",
    icon: <Icon name="FilesEarmark" />,
  },
  [NEW_FOLDER]: {
    label: "New Folder",
    icon: <Icon name="FolderPlus" />,
  },
  [RENAME]: {
    label: "Rename",
    icon: <Icon name="Pencil" />,
  },
  [DELETE]: {
    label: "Delete",
    icon: <Icon name="Trash" />,
    className: "text-red-900",
  },
  [SETTINGS]: {
    label: "Settings",
    icon: <Icon name="Gear" />,
  },
} as const;

export const nodeOptionsMap: Record<NodeOption, OptionMetadata> = {
  ...debugNodeOptionsMap,
  ...normalNodeOptionsMap,
} as const;
