import { keys } from "remeda";
import {
  ToolbarCloseButton,
  ToolbarDownloadButton,
  ToolbarHistoryButton,
  ToolbarRedoButton,
  ToolbarSwitchboardButton,
  ToolbarUndoButton,
} from "./toolbar-button.js";
import { ToolbarName } from "./toolbar-name.js";
import type { DefaultToolbarControlComponents } from "./types.js";

/**
 * Default slot layout for the built-in document toolbar controls.
 *
 * The toolbar is divided into three control groups:
 *
 * - `first`: primary document actions.
 * - `second`: document identity/display controls.
 * - `third`: secondary document actions.
 */
export const defaultControlSlots = {
  first: ["undo", "redo", "download"],
  second: ["name"],
  third: ["history", "switchboard", "close"],
} as const;

/**
 * Ordered list of toolbar slot names.
 */
export const controlSlots = keys(defaultControlSlots);

/**
 * Ordered list of all built-in document toolbar control names.
 *
 * The order is derived from `defaultControlSlots`.
 */
export const documentToolbarControls = [
  ...defaultControlSlots.first,
  ...defaultControlSlots.second,
  ...defaultControlSlots.third,
] as const;

/**
 * Default component implementation for each built-in toolbar control.
 *
 * These components are used unless a matching entry is provided through
 * `componentOverrides`.
 */
export const defaultControlComponents: DefaultToolbarControlComponents = {
  undo: ToolbarUndoButton,
  redo: ToolbarRedoButton,
  download: ToolbarDownloadButton,
  name: ToolbarName,
  switchboard: ToolbarSwitchboardButton,
  history: ToolbarHistoryButton,
  close: ToolbarCloseButton,
};
