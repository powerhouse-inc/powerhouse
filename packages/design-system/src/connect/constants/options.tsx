import { Icon } from "../../powerhouse/components/icon/icon.js";
import type {
  DebugNodeOption,
  NodeOption,
  NormalNodeOption,
  OptionMetadata,
} from "../types/options.js";

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
    icon: <Icon name="Lock" />,
    description: "Only available to you",
  },
  {
    value: "CLOUD",
    icon: <Icon name="People" />,
    description: "Only available to people in this drive",
  },
  {
    value: "PUBLIC",
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
  ["ADD_TRIGGER"]: {
    label: "Add Trigger",
    icon: <Icon className="text-orange-900" name="Plus" />,
  },
  ["REMOVE_TRIGGER"]: {
    label: "Remove Trigger",
    icon: <Icon className="text-orange-900" name="Xmark" />,
  },
  ["ADD_INVALID_TRIGGER"]: {
    label: "Add Trigger",
    icon: <Icon className="text-orange-900" name="Exclamation" />,
  },
} as const;

export const normalNodeOptionsMap: Record<NormalNodeOption, OptionMetadata> = {
  DUPLICATE: {
    label: "Duplicate",
    icon: <Icon name="FilesEarmark" />,
  },
  RENAME: {
    label: "Rename",
    icon: <Icon name="Pencil" />,
  },
  DELETE: {
    label: "Delete",
    icon: <Icon name="Trash" />,
    className: "text-red-900",
  },
  SETTINGS: {
    label: "Settings",
    icon: <Icon name="Gear" />,
  },
} as const;

export const nodeOptionsMap: Record<NodeOption, OptionMetadata> = {
  ...debugNodeOptionsMap,
  ...normalNodeOptionsMap,
} as const;
