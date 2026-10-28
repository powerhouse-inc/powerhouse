import type { HostExport } from "@powerhousedao/host-core/schema";
import {
  baseDigest,
  type CapabilitiesResponse,
  type DraftRequest,
} from "../../controller/api.js";
import { hostExport, stack } from "../../host-rules/__fixtures__/hosts.js";
import type { BuilderClient } from "../client.js";
import type { DraftStorage } from "../draft.js";

export const PROJECT = "/project";

export function memoryStorage(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const HOSTS: Record<string, () => HostExport> = {
  stack,
  switchboard: () => hostExport("switchboard"),
  vetra: () => hostExport("vetra"),
};

/** A controller serving one project: the stack, switchboard and vetra hosts. */
export function fakeBuilderClient(
  overrides: Partial<BuilderClient> = {},
  capabilities: CapabilitiesResponse = { controller: true, postgres: false },
) {
  const checked: DraftRequest[] = [];
  const client: BuilderClient = {
    projects: () => Promise.resolve([{ root: PROJECT, name: "my-project" }]),
    hosts: () => Promise.resolve(Object.keys(HOSTS)),
    capabilities: () => Promise.resolve(capabilities),
    exportHost: async (_project, host) => {
      const envelope = HOSTS[host]();
      return { export: envelope, baseDigest: await baseDigest(envelope) };
    },
    checkDraft: (request) => {
      checked.push(request);
      return Promise.resolve({ ruleIssues: [], issues: [] });
    },
    startDraft: () => Promise.reject(new Error("not in this fake")),
    ...overrides,
  };
  return { client, checked };
}
