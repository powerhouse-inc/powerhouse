import type { HostExport } from "@powerhousedao/host-core/schema";
import {
  HOST_EXPORTS,
  type HostExportFixture,
} from "../../lib/__fixtures__/host-export/index.js";
import type { HostRulesContext } from "../schema.js";

export function hostExport(name: HostExportFixture): HostExport {
  return JSON.parse(HOST_EXPORTS[name]) as HostExport;
}

/** A compound of the scaffold switchboard and connect, each with its own reactor block. */
export function stack(): HostExport {
  const base = hostExport("cli");
  return {
    ...base,
    name: "stack",
    host: {
      name: "stack",
      runner: { module: "@powerhousedao/host-core/runners/compound" },
      children: {
        sb: { host: "switchboard" },
        ui: { host: "connect" },
      },
    },
  } as HostExport;
}

export const FULL: HostRulesContext = { postgres: true, controller: true };
export const BARE: HostRulesContext = { postgres: false, controller: true };
