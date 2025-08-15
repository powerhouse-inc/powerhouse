import {
  type debugNodeOptions,
  type DRIVE,
  type FILE,
  type FOLDER,
  type nodeOptions,
  type normalNodeOptions,
} from "#connect";
import { type Node, type SharingType } from "document-drive";
import { type ReactNode } from "react";

export type OptionMetadata = {
  label: ReactNode;
  icon: React.JSX.Element;
  className?: string;
};

export type NormalNodeOptions = typeof normalNodeOptions;
export type DebugNodeOptions = typeof debugNodeOptions;
export type NodeOptions = typeof nodeOptions;
export type NormalNodeOption = NormalNodeOptions[number];
export type DebugNodeOption = DebugNodeOptions[number];
export type NodeOption = NodeOptions[number];

export type TNodeOptions = Record<
  SharingType,
  {
    [DRIVE]: NodeOption[];
    [FOLDER]: NodeOption[];
    [FILE]: NodeOption[];
  }
>;

export type DropdownMenuHandlers = Partial<
  Record<NodeOption, (node?: Node | null) => void>
>;
