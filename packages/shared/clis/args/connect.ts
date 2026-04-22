import { number, option, string } from "cmd-ts";
import {
  DEFAULT_CONNECT_OUTDIR,
  DEFAULT_CONNECT_PREVIEW_PORT,
  DEFAULT_CONNECT_STUDIO_PORT,
} from "../constants.js";
import { commonArgs, commonServerArgs } from "./common.js";

export const connectStudioArgs = {
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

export const connectBuildArgs = {
  outDir: option({
    type: string,
    long: "outDir",
    description: "Output directory",
    defaultValue: () => DEFAULT_CONNECT_OUTDIR,
    defaultValueIsSerializable: true,
  }),
  ...commonArgs,
};

export const connectPreviewArgs = {
  port: option({
    type: number,
    long: "port",
    description: "Port to run the preview server on.",
    defaultValue: () => DEFAULT_CONNECT_PREVIEW_PORT,
    defaultValueIsSerializable: true,
  }),
  outDir: option({
    type: string,
    long: "outDir",
    description: "Output directory",
    defaultValue: () => DEFAULT_CONNECT_OUTDIR,
    defaultValueIsSerializable: true,
  }),
  ...commonArgs,
  ...commonServerArgs,
};

export const connectArgs = {
  ...connectStudioArgs,
  ...connectBuildArgs,
  ...connectPreviewArgs,
};
