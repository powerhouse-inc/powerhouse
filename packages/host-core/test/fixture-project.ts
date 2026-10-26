import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Temp copies of the fixture projects, shared by the fixture tests. */

export const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "hosts",
);
const PACKAGES = [
  "ph-cli",
  "clint",
  "desktop",
  "host-core",
  "switchboard",
  "vetra-studio",
];

/** The resolving process: a fixed environment and fixed built-ins, so the
 * expectations do not depend on the machine. */
export const ENV = {
  FIXTURE_DATA_DIR: "/fixture/data",
  FIXTURE_API_KEY: "sk-fixture",
};
export const BUILTINS = {
  userData: "/fixture/user-data",
  projectRoot: "/fixture/project",
};
const temporary: string[] = [];
export function cleanupProjects(): void {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  projects.clear();
}

const projects = new Map<string, string>();

/** A temp copy of a fixture project with the fixture packages linked. */
export function project(name: string): string {
  const existing = projects.get(name);
  if (existing) return existing;
  const dir = mkdtempSync(path.join(tmpdir(), `ph-host-fixtures-${name}-`));
  temporary.push(dir);
  cpSync(path.join(FIXTURES, name), dir, { recursive: true });
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "my-project", type: "module" }),
  );
  const scope = path.join(dir, "node_modules", "@powerhousedao");
  mkdirSync(scope, { recursive: true });
  for (const pkg of PACKAGES) {
    symlinkSync(
      path.join(FIXTURES, "_packages", pkg),
      path.join(scope, pkg),
      "dir",
    );
  }
  projects.set(name, dir);
  return dir;
}

/* ---------------------------------------------------------- canned outputs */

export type Canned = Record<string, Record<string, unknown>>;

function switchboardOutputs(
  origin: string,
  drives: Record<string, { id: string; served?: string }>,
) {
  return {
    origin,
    endpoints: { graphql: `${origin}/graphql`, mcp: `${origin}/mcp` },
    drives: Object.fromEntries(
      Object.entries(drives).map(([slug, { id, served }]) => [
        slug,
        { id, url: `${origin}/d/${served ?? slug}` },
      ]),
    ),
  };
}

function connectOutputs(origin: string) {
  return { origin, endpoints: { connect: `${origin}/` } };
}

/** What each producer FOLDER reports once started, per project. */
export const CANNED: Record<string, Canned> = {
  scaffold: {
    switchboard: switchboardOutputs("http://127.0.0.1:7491", {
      powerhouse: { id: "powerhouse" },
      workflows: { id: "workflows-0f1e2d3c" },
    }),
    connect: connectOutputs("http://127.0.0.1:6491"),
  },
  matrix: {
    // `vetra` is projectHash: true (served under its hashed id); `shared`
    // and the plugin-created `workflows` hash only the id. NOT in key
    // order: `$map` visits a record key-sorted.
    switchboard: switchboardOutputs("http://127.0.0.1:4001", {
      workflows: { id: "workflows-0f1e2d3c" },
      vetra: { id: "vetra-0f1e2d3c", served: "vetra-0f1e2d3c" },
      lab: { id: "lab" },
      shared: { id: "shared-0f1e2d3c" },
    }),
    ui: connectOutputs("http://127.0.0.1:3005"),
    "connect-worker-idb": connectOutputs("http://127.0.0.1:3001"),
  },
  invariants: {
    switchboard: switchboardOutputs("http://127.0.0.1:4401", {
      inv: { id: "inv" },
    }),
    connect: connectOutputs("http://127.0.0.1:3401"),
    ping: connectOutputs("http://127.0.0.1:3402"),
    pong: connectOutputs("http://127.0.0.1:3403"),
  },
};
