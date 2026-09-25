import { tsx } from "@tmpl/core";

export const mainTsxTemplate = tsx`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import "@powerhousedao/connect/style.css";
import { startConnect, type ImportHmr } from "@powerhousedao/connect";
import styles from "./style.css?inline";
import * as localPackage from "./index.js";

const { updateLocalPackage, updateLocalStyles } = startConnect(localPackage, {
  styles,
});

(import.meta as ImportHmr).hot?.accept(["./index.js"], ([newModule]) => {
  if (newModule) {
    updateLocalPackage(newModule);
  }
});

(import.meta as ImportHmr).hot?.accept(["./style.css?inline"], ([newModule]) => {
  if (newModule) {
    updateLocalStyles(newModule.default as string);
  }
});
`.raw;
