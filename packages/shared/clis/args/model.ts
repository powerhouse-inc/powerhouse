import { boolean, flag, positional, string } from "cmd-ts";
import {
  buildArgs,
  debugArgs,
  definitionSelectionArgs,
  outDir,
  warningsAsErrors,
} from "./common.js";

const json = flag({
  type: boolean,
  long: "json",
  description:
    "Print exactly one JSON document on stdout and nothing else. Human output always goes to stderr.",
  defaultValue: () => false,
  defaultValueIsSerializable: true,
});

export const modelCheckArgs = {
  ...definitionSelectionArgs,
  outDir,
  json,
  jsonLines: flag({
    type: boolean,
    long: "json-lines",
    description:
      "With --watch, emit one report per line as newline-delimited JSON.",
    defaultValue: () => false,
    defaultValueIsSerializable: true,
  }),
  release: flag({
    type: boolean,
    long: "release",
    description:
      "Run the release profile, which also requires a typecheck and a packed-consumer import.",
    defaultValue: () => false,
    defaultValueIsSerializable: true,
  }),
  watch: flag({
    type: boolean,
    long: "watch",
    description: "Re-check after every change until interrupted.",
    defaultValue: () => false,
    defaultValueIsSerializable: true,
  }),
  warningsAsErrors,
  ...debugArgs,
};

export const modelInspectArgs = {
  selector: positional({
    type: string,
    displayName: "documentType@version",
    description: "The model to inspect, as powerhouse/invoice@1.",
  }),
  ...definitionSelectionArgs,
  json,
  ...debugArgs,
};

export const subgraphInspectArgs = {
  selector: positional({
    type: string,
    displayName: "name",
    description: "The subgraph to inspect, by the name it registers under.",
  }),
  ...definitionSelectionArgs,
  json,
  ...debugArgs,
};

export const modelPrepackArgs = buildArgs;

export const scalarInspectArgs = {
  name: positional({
    type: string,
    displayName: "name",
    description: "The scalar to inspect, as Amount_Money.",
  }),
  json,
  ...debugArgs,
};
