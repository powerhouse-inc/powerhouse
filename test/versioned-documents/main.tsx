/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { startConnect, type ImportHmr } from "@powerhousedao/connect";
import * as localPackage from "./index.js";

const { updateLocalPackage } = startConnect(localPackage);

(import.meta as ImportHmr).hot?.accept(["./index.js"], ([newModule]) => {
  if (newModule) {
    updateLocalPackage(newModule);
  }
});
