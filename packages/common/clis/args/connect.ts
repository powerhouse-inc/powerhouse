import { number, option, optional, string } from "cmd-ts";
import { commonArgs, commonServerArgs } from "./common.js";
import {
  DEFAULT_CONNECT_OUTDIR,
  DEFAULT_CONNECT_PREVIEW_PORT,
  DEFAULT_CONNECT_STUDIO_PORT,
} from "../constants.js";

export const studioArgs = {
  port: option({
    type: number,
    long: "port",
    description: "Port to run the dev server on.",
    defaultValue: () => DEFAULT_CONNECT_STUDIO_PORT,
    defaultValueIsSerializable: true,
  }),
  ...commonArgs,
  ...commonServerArgs,
};

export const buildArgs = {
  outDir: option({
    type: optional(string),
    long: "outDir",
    description: "Output directory",
    defaultValue: () => DEFAULT_CONNECT_OUTDIR,
    defaultValueIsSerializable: true,
  }),
  ...commonArgs,
};

export const previewArgs = {
  port: option({
    type: number,
    long: "port",
    description: "Port to run the preview server on.",
    defaultValue: () => DEFAULT_CONNECT_PREVIEW_PORT,
    defaultValueIsSerializable: true,
  }),
  outDir: option({
    type: optional(string),
    long: "outDir",
    description: "Output directory",
    defaultValue: () => DEFAULT_CONNECT_OUTDIR,
    defaultValueIsSerializable: true,
  }),
  ...commonArgs,
  ...commonServerArgs,
};

export const connectArgs = {
  ...studioArgs,
  ...buildArgs,
  ...previewArgs,
};
