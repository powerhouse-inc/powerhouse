/// <reference types="vite/client" />
import assistant from "./assistant.json?raw";
import cli from "./cli.json?raw";
import connect from "./connect.json?raw";
import desktop from "./desktop.json?raw";
import switchboard from "./switchboard.json?raw";
import vetra from "./vetra.json?raw";

/** `ph host export <name>` of host-core's scaffold fixture, root → /project. */
export const HOST_EXPORTS = {
  assistant,
  cli,
  connect,
  desktop,
  switchboard,
  vetra,
} as const;

export type HostExportFixture = keyof typeof HOST_EXPORTS;
