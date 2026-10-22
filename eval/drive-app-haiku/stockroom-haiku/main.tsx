/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { startConnect, type ImportHmr } from "@powerhousedao/connect";

// Loaded lazily so the package's models stay off Connect's boot path.
const { updateLocalPackage } = startConnect(() => import("./index.js"));

(import.meta as ImportHmr).hot?.accept(["./index.js"], ([newModule]) => {
  if (newModule) {
    updateLocalPackage(newModule);
  }
});
