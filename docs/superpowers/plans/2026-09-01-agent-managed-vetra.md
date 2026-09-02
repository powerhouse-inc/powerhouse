# Agent-Managed Vetra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the coding agent start Vetra itself, with per-project ports assigned in `powerhouse.config.json`, so parallel agents on different projects can never reach each other's reactor.

**Architecture:** `ph init` derives a port triple from a hash of the project name and writes it into `powerhouse.config.json` plus the literal MCP URLs. `ph vetra` resolves ports through one precedence chain (CLI flag → `process.env` → `.env.local` → `.env` → config → constant), enforces a single instance per project via a runtime record, and the agent starts it with `--strictPort` so a clash fails loudly instead of silently misrouting.

**Tech Stack:** TypeScript (nodenext ESM), cmd-ts for CLI args, vitest, `@sindresorhus/fnv1a` for hashing, dotenv for the `.env` cascade, pnpm workspace with a version catalog.

**Spec:** `docs/superpowers/specs/2026-09-01-agent-managed-vetra-design.md`

## Global Constraints

- Port bands, exact: `reactor.port` = `7000 + offset`, `studio.port` = `6000 + offset`, `vetra.connectPort` = `2000 + offset`, where `offset = fnv1a32(utf8(projectName)) % 1000` advanced deterministically past `PROJECT_PORT_DENYLIST`. (Superseded the original 41000/31000/32000 bands: those sat inside the OS ephemeral range 32768-60999 and inside ph-clint's 10000-59900 hash range. Task 1's code block below shows the original; the spec is authoritative.)
- Hash input is the **project name from `package.json`**, never a filesystem path.
- Precedence chain, exact: CLI flag → `process.env` → `.env.local` → `.env` → `powerhouse.config.json` → constant default.
- Env var names: `PH_SWITCHBOARD_PORT` (already exists, do not rename), `PH_VETRA_CONNECT_PORT` (new; deliberately NOT `PH_CONNECT_PORT`, which would imply membership in the validated SPA runtime-config family).
- Every relative import needs an explicit `.js` extension — the repo is `"module": "nodenext"`.
- Production behaviour must not change: `ph switchboard`, `ph connect build`, both Dockerfiles, and all Compose files keep their current semantics.
- New dependencies go in the `catalog:` block of `pnpm-workspace.yaml` and are referenced as `"dotenv": "catalog:"`.

---

### Task 1: `deriveProjectPorts`

**Files:**
- Create: `packages/shared/clis/project-ports.ts`
- Modify: `packages/shared/clis/constants.ts` (add band constants)
- Modify: `packages/shared/package.json` (add `./clis/project-ports` export)
- Test: `packages/shared/clis/project-ports.test.ts`

**Interfaces:**
- Produces: `deriveProjectPorts(projectName: string): { switchboardPort: number; studioPort: number; vetraConnectPort: number }`
- Produces constants: `AGENT_PORT_BAND_SWITCHBOARD = 41000`, `AGENT_PORT_BAND_STUDIO = 31000`, `AGENT_PORT_BAND_VETRA_CONNECT = 32000`, `AGENT_PORT_BAND_SIZE = 1000`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { deriveProjectPorts } from "./project-ports.js";

describe("deriveProjectPorts", () => {
  it("is deterministic for a given name", () => {
    expect(deriveProjectPorts("my-package")).toEqual(
      deriveProjectPorts("my-package"),
    );
  });

  it("lands each port in its band", () => {
    const p = deriveProjectPorts("my-package");
    expect(p.switchboardPort).toBeGreaterThanOrEqual(41000);
    expect(p.switchboardPort).toBeLessThan(42000);
    expect(p.studioPort).toBeGreaterThanOrEqual(31000);
    expect(p.studioPort).toBeLessThan(32000);
    expect(p.vetraConnectPort).toBeGreaterThanOrEqual(32000);
    expect(p.vetraConnectPort).toBeLessThan(33000);
  });

  it("never returns two identical ports", () => {
    const p = deriveProjectPorts("my-package");
    expect(new Set(Object.values(p)).size).toBe(3);
  });

  it("spreads realistic project names across distinct offsets", () => {
    const names = [
      "todo-demo", "billing-models", "@acme/contracts", "vetra-playground",
      "powerhouse-atlas", "my-package", "invoice-suite", "chatroom",
    ];
    const offsets = new Set(
      names.map((n) => deriveProjectPorts(n).switchboardPort),
    );
    expect(offsets.size).toBe(names.length);
  });

  it("rejects an empty name", () => {
    expect(() => deriveProjectPorts("")).toThrow(/project name/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/shared/clis/project-ports.test.ts`
Expected: FAIL — cannot resolve `./project-ports.js`

- [ ] **Step 3: Add band constants**

Append to `packages/shared/clis/constants.ts`:

```ts
// Per-project dev-server port bands. `ph init` assigns a project a port
// triple derived from its name so two projects never collide, and so an
// agent's MCP URL can be baked into .mcp.json before a session starts.
// Chosen clear of the standard Powerhouse ports (3000, 3001, 4001, 4173)
// and of common dev-server ports (5173, 8080, 9229).
export const AGENT_PORT_BAND_SIZE = 1000 as const;
export const AGENT_PORT_BAND_SWITCHBOARD = 41000 as const;
export const AGENT_PORT_BAND_STUDIO = 31000 as const;
export const AGENT_PORT_BAND_VETRA_CONNECT = 32000 as const;
```

- [ ] **Step 4: Write the implementation**

```ts
import fnv1a from "@sindresorhus/fnv1a";
import {
  AGENT_PORT_BAND_SIZE,
  AGENT_PORT_BAND_STUDIO,
  AGENT_PORT_BAND_SWITCHBOARD,
  AGENT_PORT_BAND_VETRA_CONNECT,
} from "./constants.js";

export type ProjectPorts = {
  switchboardPort: number;
  studioPort: number;
  vetraConnectPort: number;
};

/**
 * Derive a project's dev-server port triple from its package name.
 *
 * Name-derived rather than path-derived on purpose: the switchboard port is
 * written literally into the project's committed `.mcp.json`, so it has to
 * reproduce identically on every machine that clones the repo.
 */
export function deriveProjectPorts(projectName: string): ProjectPorts {
  if (!projectName.trim()) {
    throw new Error("A project name is required to derive project ports.");
  }
  const offset = Number(fnv1a(projectName, { size: 32 }) % BigInt(AGENT_PORT_BAND_SIZE));
  return {
    switchboardPort: AGENT_PORT_BAND_SWITCHBOARD + offset,
    studioPort: AGENT_PORT_BAND_STUDIO + offset,
    vetraConnectPort: AGENT_PORT_BAND_VETRA_CONNECT + offset,
  };
}
```

- [ ] **Step 5: Add the subpath export**

In `packages/shared/package.json`, beside `"./clis/constants"`:

```json
"./clis/project-ports": {
  "source": "./clis/project-ports.ts",
  "import": "./dist/clis/project-ports.mjs"
},
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/shared/clis/project-ports.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/shared/clis/project-ports.ts packages/shared/clis/project-ports.test.ts packages/shared/clis/constants.ts packages/shared/package.json
git commit -m "feat(shared): derive per-project dev ports from the package name"
```

---

### Task 2: `vetra.connectPort` in the config schema

**Files:**
- Modify: `packages/shared/clis/types.ts:318-321`
- Modify: `packages/shared/clis/source-config.schema.json:216-229`
- Test: `packages/shared/clis/source-config-schema.test.ts`

**Interfaces:**
- Produces: `PowerhouseConfig["vetra"]` becomes `{ driveId?: string; driveUrl?: string; connectPort?: number }`

- [ ] **Step 1: Write the failing test**

Add to `packages/shared/clis/source-config-schema.test.ts`:

```ts
it("accepts a vetra block carrying only connectPort", () => {
  expect(validateSourceConfig({ vetra: { connectPort: 32837 } })).toEqual([]);
});

it("still accepts a vetra block with drive coordinates", () => {
  expect(
    validateSourceConfig({
      vetra: { driveId: "vetra-abc", driveUrl: "http://localhost:41837/d/vetra-abc" },
    }),
  ).toEqual([]);
});
```

Match the file's existing helper name and assertion style; if it exposes something other than `validateSourceConfig`, use that.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/shared/clis/source-config-schema.test.ts`
Expected: FAIL — `vetra` requires `driveId` and `driveUrl`

- [ ] **Step 3: Loosen the schema and add the field**

In `source-config.schema.json`, replace the `vetra` block's `"required": ["driveId", "driveUrl"]` with no `required` key, and add:

```json
"connectPort": {
  "type": "integer",
  "description": "Port `ph vetra`'s Connect dev server listens on. Assigned per project by `ph init`. Overridden by PH_VETRA_CONNECT_PORT or --connect-port."
}
```

- [ ] **Step 4: Update the type**

```ts
  vetra?: {
    driveId?: string;
    driveUrl?: string;
    connectPort?: number;
  };
```

- [ ] **Step 5: Run tests and the type check**

Run: `pnpm vitest run packages/shared/clis/source-config-schema.test.ts`
Expected: PASS

Run: `pnpm --filter @powerhousedao/shared exec tsc --noEmit`
Expected: no errors. If `config.vetra.driveUrl` is now flagged anywhere as possibly undefined, add the guard at that call site.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/clis/types.ts packages/shared/clis/source-config.schema.json packages/shared/clis/source-config-schema.test.ts
git commit -m "feat(shared): allow a vetra config block carrying only connectPort"
```

---

### Task 3: `.env` cascade loader

**Files:**
- Create: `packages/shared/clis/project-env.ts`
- Modify: `pnpm-workspace.yaml` (catalog: `dotenv`)
- Modify: `packages/shared/package.json` (dependency + subpath export)
- Test: `packages/shared/clis/project-env.test.ts`

**Interfaces:**
- Produces: `loadProjectEnv(cwd?: string): void` — idempotent; loads `.env.local` then `.env`, neither overriding an existing `process.env` value.
- Produces: `readPortEnv(name: string): number | undefined` — parses an env var as a port, returning `undefined` for unset/blank/non-numeric/out-of-range.

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadProjectEnv, readPortEnv, resetProjectEnvForTests } from "./project-env.js";

describe("loadProjectEnv", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ph-env-"));
    delete process.env.PH_SWITCHBOARD_PORT;
    resetProjectEnvForTests();
  });
  afterEach(() => {
    delete process.env.PH_SWITCHBOARD_PORT;
    resetProjectEnvForTests();
  });

  it("reads .env", () => {
    writeFileSync(join(dir, ".env"), "PH_SWITCHBOARD_PORT=41001\n");
    loadProjectEnv(dir);
    expect(process.env.PH_SWITCHBOARD_PORT).toBe("41001");
  });

  it("lets .env.local win over .env", () => {
    writeFileSync(join(dir, ".env"), "PH_SWITCHBOARD_PORT=41001\n");
    writeFileSync(join(dir, ".env.local"), "PH_SWITCHBOARD_PORT=41002\n");
    loadProjectEnv(dir);
    expect(process.env.PH_SWITCHBOARD_PORT).toBe("41002");
  });

  it("lets a real process.env value win over both files", () => {
    process.env.PH_SWITCHBOARD_PORT = "41003";
    writeFileSync(join(dir, ".env"), "PH_SWITCHBOARD_PORT=41001\n");
    writeFileSync(join(dir, ".env.local"), "PH_SWITCHBOARD_PORT=41002\n");
    loadProjectEnv(dir);
    expect(process.env.PH_SWITCHBOARD_PORT).toBe("41003");
  });

  it("is a no-op when neither file exists", () => {
    loadProjectEnv(dir);
    expect(process.env.PH_SWITCHBOARD_PORT).toBeUndefined();
  });
});

describe("readPortEnv", () => {
  afterEach(() => delete process.env.PH_TEST_PORT);

  it("parses a valid port", () => {
    process.env.PH_TEST_PORT = "41837";
    expect(readPortEnv("PH_TEST_PORT")).toBe(41837);
  });

  it.each(["", "   ", "abc", "0", "70000", "-1", "41837.5"])(
    "ignores the invalid value %j",
    (raw) => {
      process.env.PH_TEST_PORT = raw;
      expect(readPortEnv("PH_TEST_PORT")).toBeUndefined();
    },
  );

  it("returns undefined when unset", () => {
    expect(readPortEnv("PH_TEST_PORT")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/shared/clis/project-env.test.ts`
Expected: FAIL — cannot resolve `./project-env.js`

- [ ] **Step 3: Add the dependency**

In `pnpm-workspace.yaml`, inside `catalog:`:

```yaml
  "dotenv": 16.4.7
```

In `packages/shared/package.json` `dependencies`:

```json
"dotenv": "catalog:",
```

Then run `pnpm install`.

- [ ] **Step 4: Write the implementation**

```ts
import dotenv from "dotenv";
import { join } from "node:path";

let loadedFor: string | undefined;

/**
 * Load the project's `.env.local` and `.env` into `process.env`.
 *
 * `dotenv` never overwrites a variable that is already set, so loading
 * `.env.local` first and `.env` second yields the precedence the CLI
 * documents: real `process.env` beats `.env.local`, which beats `.env`.
 *
 * Idempotent per directory — CLI arg defaults call it lazily and may call it
 * more than once.
 */
export function loadProjectEnv(cwd: string = process.cwd()): void {
  if (loadedFor === cwd) return;
  loadedFor = cwd;
  dotenv.config({ path: join(cwd, ".env.local"), quiet: true });
  dotenv.config({ path: join(cwd, ".env"), quiet: true });
}

/** Test seam: forget which directory was loaded. */
export function resetProjectEnvForTests(): void {
  loadedFor = undefined;
}

/**
 * Read an env var as a TCP port. Anything that is not a plain integer in
 * 1-65535 is ignored rather than throwing: a typo in `.env` should fall
 * through to the next source in the precedence chain, not break the CLI.
 */
export function readPortEnv(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const port = Number(raw);
  if (port < 1 || port > 65535) return undefined;
  return port;
}
```

If the installed `dotenv` rejects the `quiet` option, drop it from both calls.

- [ ] **Step 5: Add the subpath export**

In `packages/shared/package.json`:

```json
"./clis/project-env": {
  "source": "./clis/project-env.ts",
  "import": "./dist/clis/project-env.mjs"
},
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/shared/clis/project-env.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml packages/shared/package.json packages/shared/clis/project-env.ts packages/shared/clis/project-env.test.ts
git commit -m "feat(shared): add .env.local-over-.env project env cascade"
```

---

### Task 4: Wire precedence into the vetra args

**Files:**
- Modify: `packages/shared/clis/args/vetra.ts:14-29`
- Test: `packages/shared/clis/args/vetra-ports.test.ts`

**Interfaces:**
- Consumes: `deriveProjectPorts` (Task 1), `loadProjectEnv` / `readPortEnv` (Task 3), `vetra.connectPort` (Task 2)
- Produces: `vetraArgs.switchboardPort` and `vetraArgs.connectPort` defaults resolving through the full chain.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const getConfig = vi.hoisted(() => vi.fn());
vi.mock("../file-system/get-config.js", () => ({ getConfig }));

const { resolveSwitchboardPortDefault, resolveConnectPortDefault } = await import(
  "./vetra.js"
);

describe("vetra port defaults", () => {
  afterEach(() => {
    delete process.env.PH_SWITCHBOARD_PORT;
    delete process.env.PH_VETRA_CONNECT_PORT;
    getConfig.mockReset();
  });

  it("prefers PH_SWITCHBOARD_PORT over the config value", () => {
    process.env.PH_SWITCHBOARD_PORT = "41999";
    getConfig.mockReturnValue({ reactor: { port: 41001 } });
    expect(resolveSwitchboardPortDefault()).toBe(41999);
  });

  it("falls back to reactor.port from the config", () => {
    getConfig.mockReturnValue({ reactor: { port: 41001 } });
    expect(resolveSwitchboardPortDefault()).toBe(41001);
  });

  it("falls back to the standard port when the config says nothing", () => {
    getConfig.mockReturnValue({});
    expect(resolveSwitchboardPortDefault()).toBe(4001);
  });

  it("prefers PH_VETRA_CONNECT_PORT over vetra.connectPort", () => {
    process.env.PH_VETRA_CONNECT_PORT = "32999";
    getConfig.mockReturnValue({ vetra: { connectPort: 32001 } });
    expect(resolveConnectPortDefault()).toBe(32999);
  });

  it("falls back to vetra.connectPort", () => {
    getConfig.mockReturnValue({ vetra: { connectPort: 32001 } });
    expect(resolveConnectPortDefault()).toBe(32001);
  });

  it("falls back to the standard vetra connect port", () => {
    getConfig.mockReturnValue({});
    expect(resolveConnectPortDefault()).toBe(3001);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/shared/clis/args/vetra-ports.test.ts`
Expected: FAIL — `resolveSwitchboardPortDefault` is not exported

- [ ] **Step 3: Extract and export the resolvers**

In `packages/shared/clis/args/vetra.ts`, add above `vetraArgs`:

```ts
/**
 * Precedence: CLI flag (handled by cmd-ts, above this function) → process.env
 * → .env.local → .env → powerhouse.config.json → constant default.
 * `loadProjectEnv` folds the two files into process.env without clobbering
 * anything already set, so one lookup covers the middle three.
 */
export function resolveSwitchboardPortDefault(): number {
  loadProjectEnv();
  return (
    readPortEnv("PH_SWITCHBOARD_PORT") ??
    getConfig().reactor?.port ??
    DEFAULT_SWITCHBOARD_PORT
  );
}

export function resolveConnectPortDefault(): number {
  loadProjectEnv();
  return (
    readPortEnv("PH_VETRA_CONNECT_PORT") ??
    getConfig().vetra?.connectPort ??
    DEFAULT_VETRA_CONNECT_PORT
  );
}
```

Import them from `../project-env.js`, then point both args at the resolvers:

```ts
  switchboardPort: option({
    type: number,
    long: "switchboard-port",
    description: "port to use for the Vetra Switchboard",
    defaultValue: resolveSwitchboardPortDefault,
  }),
  connectPort: option({
    type: number,
    long: "connect-port",
    description: "port to use for the Vetra Connect",
    defaultValue: resolveConnectPortDefault,
  }),
```

Drop `defaultValueIsSerializable: true` from `connectPort`: the value is no longer a constant, and cmd-ts prints serializable defaults into `--help`, which would bake one project's port into the help text.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/shared/clis/args/vetra-ports.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/clis/args/vetra.ts packages/shared/clis/args/vetra-ports.test.ts
git commit -m "feat(shared): resolve vetra ports through env then project config"
```

---

### Task 5: `ph init` assigns and writes the ports

**Files:**
- Modify: `packages/codegen/src/templates/boilerplate/powerhouse.config.json.ts`
- Modify: `packages/codegen/src/templates/boilerplate/mcp.json.ts`
- Modify: `packages/codegen/src/templates/boilerplate/cursor/mcp.json.ts`
- Modify: `packages/codegen/src/file-builders/boilerplate/generated-project-files.ts`
- Modify: `packages/codegen/src/create-lib/create-project.ts:92-99`
- Test: `packages/codegen/src/file-builders/boilerplate/project-ports.test.ts`

**Interfaces:**
- Consumes: `deriveProjectPorts` (Task 1)
- Produces: `buildPowerhouseConfigTemplate({ name, ... })`; `buildMcpTemplate(port)`; `buildCursorMcpTemplate(port)`; `applyProjectCustomizations` also rewrites both MCP files and the config's three ports.

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveProjectPorts } from "@powerhousedao/shared/clis/project-ports";
import { describe, expect, it } from "vitest";
import { applyProjectCustomizations } from "./generated-project-files.js";

describe("applyProjectCustomizations port assignment", () => {
  it("writes the derived ports into the config and both MCP files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-ports-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "placeholder" }));
    writeFileSync(
      join(dir, "powerhouse.config.json"),
      JSON.stringify({ studio: { port: 3000 }, reactor: { port: 4001 } }),
    );
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { "reactor-mcp": { type: "http", url: "http://localhost:4001/mcp" } } }),
    );
    writeFileSync(
      join(dir, ".cursor", "mcp.json"),
      JSON.stringify({ mcpServers: { "reactor-mcp": { type: "http", url: "http://localhost:4001/mcp" } } }),
    );

    await applyProjectCustomizations({ name: "my-package", projectDir: dir });

    const expected = deriveProjectPorts("my-package");
    const config = JSON.parse(readFileSync(join(dir, "powerhouse.config.json"), "utf8"));
    expect(config.reactor.port).toBe(expected.switchboardPort);
    expect(config.studio.port).toBe(expected.studioPort);
    expect(config.vetra.connectPort).toBe(expected.vetraConnectPort);

    for (const p of [join(dir, ".mcp.json"), join(dir, ".cursor", "mcp.json")]) {
      const mcp = JSON.parse(readFileSync(p, "utf8"));
      expect(mcp.mcpServers["reactor-mcp"].url).toBe(
        `http://localhost:${expected.switchboardPort}/mcp`,
      );
    }
  });
});
```

Create `.cursor/` with `mkdirSync(join(dir, ".cursor"), { recursive: true })` before writing into it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/codegen/src/file-builders/boilerplate/project-ports.test.ts`
Expected: FAIL — ports still 4001/3000

- [ ] **Step 3: Parameterise the templates**

`mcp.json.ts` — keep the old export for compatibility, add a builder:

```ts
import { json } from "@tmpl/core";
import { DEFAULT_SWITCHBOARD_PORT } from "@powerhousedao/shared/clis/constants";

export const buildMcpTemplate = (port: number) => json`
{
  "mcpServers": {
    "reactor-mcp": {
      "type": "http",
      "url": "http://localhost:${String(port)}/mcp"
    }
  }
}
`.raw;

export const mcpTemplate = buildMcpTemplate(DEFAULT_SWITCHBOARD_PORT);
```

Do the same in `cursor/mcp.json.ts` as `buildCursorMcpTemplate` / `cursorMcpTemplate`.

- [ ] **Step 4: Derive ports in the config template**

In `powerhouse.config.json.ts`, add `name` to `BuildPowerhouseConfigTemplateArgs` and replace the two hardcoded port lines:

```ts
  const ports = deriveProjectPorts(args.name);
  const config: Record<string, unknown> = {
    ...
    studio: { port: ports.studioPort },
    reactor: { port: ports.switchboardPort },
    ...
  };
  config.vetra = { connectPort: ports.vetraConnectPort };
  if (args.remoteDrive) {
    const driveId = args.remoteDrive.split("/").pop() ?? "";
    config.vetra = { ...(config.vetra as object), driveId, driveUrl: args.remoteDrive };
  }
```

Pass `name` at `generated-project-files.ts:198`.

- [ ] **Step 5: Rewrite the MCP files in `applyProjectCustomizations`**

Append, after the manifest update:

```ts
  // Ports are per-project so parallel agents can't reach each other's
  // reactor. Written here rather than only in the config template because
  // the `--clone` path inherits the source project's numbers.
  const ports = deriveProjectPorts(name);
  const configPath = join(projectDir, "powerhouse.config.json");
  const config = (await loadJsonFile(configPath)) as Record<string, unknown>;
  config.studio = { ...(config.studio as object), port: ports.studioPort };
  config.reactor = { ...(config.reactor as object), port: ports.switchboardPort };
  config.vetra = { ...(config.vetra as object), connectPort: ports.vetraConnectPort };
  if (remoteDrive) {
    const driveId = remoteDrive.split("/").pop() ?? "";
    config.vetra = { ...(config.vetra as object), driveId, driveUrl: remoteDrive };
  }
  await writeJsonFile(configPath, config, { indent: 2 });

  for (const rel of [".mcp.json", join(".cursor", "mcp.json")]) {
    const p = join(projectDir, rel);
    if (!existsSync(p)) continue;
    await writeFileEnsuringDir(p, buildMcpTemplate(ports.switchboardPort).trimStart());
  }
```

Delete the old `if (remoteDrive) { ... }` config block this replaces, so the file is written once.

- [ ] **Step 6: Reorder the scaffold path**

`applyProjectCustomizations` must run *after* `.mcp.json` exists. In `create-project.ts`, remove the `applyProjectCustomizations` call from the end of `writeProjectRootFiles` and call it explicitly:

```ts
  await writeProjectRootFiles({ name, tag, version, remoteDrive, packageManager });
  await writeAllGeneratedProjectFiles();
  await applyProjectCustomizations({ name, projectDir: appPath, remoteDrive });
```

`writeProjectRootFiles` has exactly one caller, so moving the call is safe.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm vitest run packages/codegen/src/file-builders/boilerplate/project-ports.test.ts`
Expected: PASS

Run: `pnpm vitest run packages/codegen`
Expected: PASS — no existing codegen test regresses

- [ ] **Step 8: Commit**

```bash
git add packages/codegen packages/shared
git commit -m "feat(codegen): assign per-project ports in ph init"
```

---

### Task 6: Single-instance guard and MCP drift sync

**Files:**
- Create: `clis/ph-cli/src/utils/vetra-runtime.ts`
- Modify: `clis/ph-cli/src/services/vetra.ts`
- Test: `clis/ph-cli/src/utils/vetra-runtime.test.ts`

**Interfaces:**
- Produces: `readVetraRuntime(projectDir)`, `writeVetraRuntime(projectDir, record)`, `clearVetraRuntime(projectDir)`, `probeVetraRuntime(projectDir, projectName)`, `syncMcpPort(projectDir, port)`
- `VetraRuntimeRecord = { pid: number; projectName: string; switchboardPort: number; connectPort: number; mcpUrl: string; startedAt: string }`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  clearVetraRuntime, probeVetraRuntime, readVetraRuntime, syncMcpPort, writeVetraRuntime,
} from "./vetra-runtime.js";

const record = {
  pid: process.pid,
  projectName: "my-package",
  switchboardPort: 41837,
  connectPort: 32837,
  mcpUrl: "http://localhost:41837/mcp",
  startedAt: new Date().toISOString(),
};

describe("vetra runtime record", () => {
  it("round-trips", () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-rt-"));
    writeVetraRuntime(dir, record);
    expect(readVetraRuntime(dir)).toEqual(record);
    clearVetraRuntime(dir);
    expect(readVetraRuntime(dir)).toBeUndefined();
  });

  it("reports no instance when the file is absent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-rt-"));
    await expect(probeVetraRuntime(dir, "my-package")).resolves.toEqual({ status: "none" });
  });

  it("treats a dead pid as stale and deletes the record", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-rt-"));
    writeVetraRuntime(dir, { ...record, pid: 2 ** 22 });
    await expect(probeVetraRuntime(dir, "my-package")).resolves.toEqual({ status: "stale" });
    expect(readVetraRuntime(dir)).toBeUndefined();
  });

  it("treats a live pid whose /ready never answers as stale", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-rt-"));
    writeVetraRuntime(dir, record);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(probeVetraRuntime(dir, "my-package")).resolves.toEqual({ status: "stale" });
    vi.unstubAllGlobals();
  });

  it("treats a mismatched projectName as a foreign instance", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-rt-"));
    writeVetraRuntime(dir, record);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await expect(probeVetraRuntime(dir, "other-package")).resolves.toEqual({
      status: "foreign", record,
    });
    vi.unstubAllGlobals();
  });

  it("reports a live instance", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-rt-"));
    writeVetraRuntime(dir, record);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await expect(probeVetraRuntime(dir, "my-package")).resolves.toEqual({
      status: "live", record,
    });
    vi.unstubAllGlobals();
  });
});

describe("syncMcpPort", () => {
  it("rewrites a drifted url and reports the change", () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-mcp-"));
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { "reactor-mcp": { type: "http", url: "http://localhost:4001/mcp" } } }, null, 2),
    );
    expect(syncMcpPort(dir, 41837)).toEqual([".mcp.json"]);
    const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
    expect(mcp.mcpServers["reactor-mcp"].url).toBe("http://localhost:41837/mcp");
  });

  it("does nothing when the port already matches", () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-mcp-"));
    mkdirSync(join(dir, ".cursor"));
    const body = { mcpServers: { "reactor-mcp": { type: "http", url: "http://localhost:41837/mcp" } } };
    writeFileSync(join(dir, ".mcp.json"), JSON.stringify(body, null, 2));
    writeFileSync(join(dir, ".cursor", "mcp.json"), JSON.stringify(body, null, 2));
    expect(syncMcpPort(dir, 41837)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run clis/ph-cli/src/utils/vetra-runtime.test.ts`
Expected: FAIL — cannot resolve `./vetra-runtime.js`

- [ ] **Step 3: Write the implementation**

```ts
import fs from "node:fs";
import path from "node:path";

export type VetraRuntimeRecord = {
  pid: number;
  projectName: string;
  switchboardPort: number;
  connectPort: number;
  mcpUrl: string;
  startedAt: string;
};

export type VetraProbe =
  | { status: "none" }
  | { status: "stale" }
  | { status: "live"; record: VetraRuntimeRecord }
  | { status: "foreign"; record: VetraRuntimeRecord };

const RECORD_REL = path.join(".ph", "vetra-runtime.json");

const recordPath = (projectDir: string) => path.join(projectDir, RECORD_REL);

export function readVetraRuntime(projectDir: string): VetraRuntimeRecord | undefined {
  try {
    return JSON.parse(fs.readFileSync(recordPath(projectDir), "utf8")) as VetraRuntimeRecord;
  } catch {
    return undefined;
  }
}

export function writeVetraRuntime(projectDir: string, record: VetraRuntimeRecord): void {
  const p = recordPath(projectDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(record, null, 2)}\n`);
}

export function clearVetraRuntime(projectDir: string): void {
  try {
    fs.rmSync(recordPath(projectDir));
  } catch {
    // already gone
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function isReady(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/ready`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Decide whether the recorded instance is actually serving this project.
 *
 * All three checks are needed. A pid can be reused by an unrelated process,
 * so pid alone proves nothing. Another project's switchboard would answer
 * `/ready` on its own port, so `/ready` alone proves nothing either. And the
 * recorded `projectName` is what separates "my instance" from "someone
 * else's instance that happens to hold this port".
 */
export async function probeVetraRuntime(
  projectDir: string,
  projectName: string,
): Promise<VetraProbe> {
  const record = readVetraRuntime(projectDir);
  if (!record) return { status: "none" };
  if (!isPidAlive(record.pid) || !(await isReady(record.switchboardPort))) {
    clearVetraRuntime(projectDir);
    return { status: "stale" };
  }
  if (record.projectName !== projectName) return { status: "foreign", record };
  return { status: "live", record };
}

const MCP_FILES = [".mcp.json", path.join(".cursor", "mcp.json")];

/**
 * Point every generated MCP config at `port`, returning the files changed.
 *
 * An MCP client resolves these files at session start and cannot read the
 * project config or `.env`, so the literal has to be corrected on disk when
 * an override moves the port.
 */
export function syncMcpPort(projectDir: string, port: number): string[] {
  const changed: string[] = [];
  for (const rel of MCP_FILES) {
    const p = path.join(projectDir, rel);
    if (!fs.existsSync(p)) continue;
    let parsed: { mcpServers?: Record<string, { url?: string }> };
    try {
      parsed = JSON.parse(fs.readFileSync(p, "utf8")) as typeof parsed;
    } catch {
      continue;
    }
    const server = parsed.mcpServers?.["reactor-mcp"];
    if (!server?.url) continue;
    const wanted = `http://localhost:${port}/mcp`;
    if (server.url === wanted) continue;
    server.url = wanted;
    fs.writeFileSync(p, `${JSON.stringify(parsed, null, 2)}\n`);
    changed.push(rel);
  }
  return changed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run clis/ph-cli/src/utils/vetra-runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Hook the guard into `startVetra`**

At the top of `startVetra` in `clis/ph-cli/src/services/vetra.ts`, before starting anything:

```ts
  const projectDir = process.cwd();
  const projectName = readPackageSync({ cwd: projectDir }).name ?? "";
  const probe = await probeVetraRuntime(projectDir, projectName);
  if (probe.status === "live") {
    console.log(green("Vetra is already running for this project."));
    console.log(green(`    Connect:     http://localhost:${probe.record.connectPort}`));
    console.log(green(`    Switchboard: http://localhost:${probe.record.switchboardPort}/graphql`));
    console.log(`Stop that instance (pid ${probe.record.pid}) if you need to restart it.`);
    return;
  }
  if (probe.status === "foreign") {
    console.error(
      red(
        `.ph/vetra-runtime.json describes a live instance for "${probe.record.record?.projectName ?? probe.record.projectName}", not "${projectName}". ` +
          `Refusing to start. Delete .ph/vetra-runtime.json if that record is wrong.`,
      ),
    );
    process.exit(1);
  }
```

After `startLocalVetraSwitchboard` returns and `actualSwitchboardPort` is known, record it and reconcile the MCP files:

```ts
    writeVetraRuntime(projectDir, {
      pid: process.pid,
      projectName,
      switchboardPort: actualSwitchboardPort,
      connectPort,
      mcpUrl: `http://localhost:${actualSwitchboardPort}/mcp`,
      startedAt: new Date().toISOString(),
    });
    const cleanup = () => clearVetraRuntime(projectDir);
    process.on("exit", cleanup);
    process.on("SIGINT", () => { cleanup(); process.exit(130); });
    process.on("SIGTERM", () => { cleanup(); process.exit(143); });

    const drifted = syncMcpPort(projectDir, actualSwitchboardPort);
    if (drifted.length > 0) {
      console.log(
        yellow(
          `Updated ${drifted.join(" and ")} to port ${actualSwitchboardPort}. ` +
            `Reconnect your MCP client (/mcp) to pick it up. This edit is local — do not commit it.`,
        ),
      );
    }
```

- [ ] **Step 6: Type-check**

Run: `pnpm --filter @powerhousedao/ph-cli exec tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add clis/ph-cli/src
git commit -m "feat(ph-cli): enforce one vetra instance per project and sync the MCP port"
```

---

### Task 7: AGENTS.md tells the agent to start Vetra

**Files:**
- Modify: `packages/codegen/src/templates/boilerplate/AGENTS.md.ts:22,27`

- [ ] **Step 1: Replace the prohibition**

Replace line 27 with the procedure:

```
If the \`reactor-mcp\` server is unavailable, **start Vetra yourself** — do not ask the user to do it:

1. Check \`.ph/vetra-runtime.json\`. If it exists and describes a live instance, Vetra is already running: report the Connect URL and stop. Never start a second instance — one project must have exactly one reactor.
2. Otherwise run \`ph vetra --strictPort --watch\` **as a background process**. Pass no port flags: the project's ports live in \`powerhouse.config.json\` and are what \`.mcp.json\` already points at. Passing your own port is how you end up talking to a different project's reactor.
3. Poll \`GET /ready\` on the port from \`.mcp.json\` until it returns 200, for at most 60 seconds. Poll that port specifically — it is the only one your MCP client will use, so a timeout there is the correct signal even if Vetra came up elsewhere.
4. Tell the user the Connect URL so they can watch their editors render.
5. Reconnect to the MCP server and continue.

Escalate to the user only when startup actually fails — \`--strictPort\` rejected the port, \`/ready\` never returned 200, or the process crashed — and include the real error. Never edit \`.mcp.json\` to chase a port: a mismatch is a bug to report, and \`ph vetra\` owns that reconciliation.
```

- [ ] **Step 2: Update the Vetra concept line**

Replace the tail of line 22 — "Start it with \`ph vetra\`." — with:

```
You start it yourself with \`ph vetra --strictPort --watch\` in the background; see the MCP rules below.
```

- [ ] **Step 3: Verify the template still renders**

Run: `pnpm vitest run packages/codegen`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/codegen/src/templates/boilerplate/AGENTS.md.ts
git commit -m "feat(codegen): let the agent start vetra instead of asking the user"
```

---

### Task 8: Full verification and PR

- [ ] **Step 1: Run the affected test suites**

```bash
pnpm vitest run packages/shared/clis packages/codegen clis/ph-cli
```

- [ ] **Step 2: Type-check the touched packages**

```bash
pnpm --filter @powerhousedao/shared --filter @powerhousedao/codegen --filter @powerhousedao/ph-cli exec tsc --noEmit
```

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/agent-managed-vetra
gh pr create --title "feat: agent-managed Vetra with per-project ports" --body-file <(...)
```
