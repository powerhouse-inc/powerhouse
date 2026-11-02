import { FULL, stack } from "../../host-rules/__fixtures__/hosts.js";
import {
  addDriveStatus,
  applyOption,
  hostOptions,
  type HostDraft,
  type Setter,
} from "../../host-rules/index.js";
import type { BuilderRun } from "../run.js";
import { PROJECT } from "./fakes.js";

export const UI = "host.children.ui";

/** The stack with its Connect opening a new drive "shared" on sb only. */
export function linkedStack(): { draft: HostDraft; setters: Setter[] } {
  let draft: HostDraft = { envelope: stack() };
  const setters: Setter[] = [];
  const add = addDriveStatus(draft, FULL, "host.children.sb", "Shared");
  draft = applyOption(draft, add!).draft;
  setters.push(...add!.setters);
  const open = hostOptions(draft, FULL).find(
    (option) => option.id === `${UI}:reach:open:sb:shared`,
  );
  draft = applyOption(draft, open!).draft;
  setters.push(...open!.setters);
  return { draft, setters };
}

export function runOf(overrides: Partial<BuilderRun> = {}): BuilderRun {
  return {
    id: "inst-1",
    status: "running",
    source: { project: PROJECT, host: "stack" },
    reactors: [
      {
        name: "sb",
        url: "http://127.0.0.1:7001/d/powerhouse",
        drives: {
          powerhouse: {
            id: "id-powerhouse",
            url: "http://127.0.0.1:7001/d/powerhouse",
          },
          shared: { id: "id-shared", url: "http://127.0.0.1:7001/d/shared" },
        },
      },
      { name: "ui", app: "http://localhost:13001/" },
    ],
    browser: ["ui.main"],
    attached: {
      browser: [{ name: "ui.main", member: "ui", backend: "main" }],
      remote: [{ name: "sb-inst-1", member: "sb" }],
    },
    ...overrides,
  };
}
