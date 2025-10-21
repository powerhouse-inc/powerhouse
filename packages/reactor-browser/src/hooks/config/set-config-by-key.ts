import type {
  PHDocumentEditorConfig,
  PHDocumentEditorConfigKey,
  PHDriveEditorConfig,
  PHDriveEditorConfigKey,
  PHGlobalConfig,
  PHGlobalConfigKey,
} from "@powerhousedao/reactor-browser";
import { phGlobalConfigSetters } from "./connect.js";
import {
  phDocumentEditorConfigSetters,
  phDriveEditorConfigSetters,
} from "./editor.js";

export function setPHGlobalConfigByKey<TKey extends PHGlobalConfigKey>(
  key: TKey,
  value: PHGlobalConfig[TKey] | undefined,
) {
  const setter = phGlobalConfigSetters[key];
  setter(value);
}

export function setPHDriveEditorConfigByKey<
  TKey extends PHDriveEditorConfigKey,
>(key: TKey, value: PHDriveEditorConfig[TKey] | undefined) {
  const setter = phDriveEditorConfigSetters[key];
  setter(value);
}

export function setPHDocumentEditorConfigByKey<
  TKey extends PHDocumentEditorConfigKey,
>(key: TKey, value: PHDocumentEditorConfig[TKey] | undefined) {
  const setter = phDocumentEditorConfigSetters[key];
  setter(value);
}
