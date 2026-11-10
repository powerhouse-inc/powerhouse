# Boolean Manifest Config Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `powerhouse.manifest.json` config entries accept `type: "boolean"`, wrong values fail with readable messages, and the `config` block is documented (#3012).

**Architecture:** The zod schema in `@powerhousedao/shared` changes; codegen already validates manifests with `ManifestSchema.parse`, so it picks up the change through shared's `dist/`. An Academy reference page documents the block.

**Tech Stack:** TypeScript, zod 4 (`^4.5.4`), vitest (`packages/shared`), bun test (`test/codegen`), Docusaurus markdown (`apps/academy`).

**Spec:** docs/superpowers/specs/2026-11-10-manifest-boolean-config-design.md

## Global Constraints

- Accepted types: `"var"`, `"secret"`, `"boolean"`. Wrong type message: `type must be one of "var", "secret", "boolean"`.
- `default` stays `string`. Boolean entries: only `"true"` or `"false"`; message on path `default`: `default must be "true" or "false" for a boolean entry`.
- `secret` with `default` stays valid. `var` unchanged.
- Workspace deps resolve to `dist/`: rebuild `@powerhousedao/shared` (and `@powerhousedao/codegen`) before running codegen's tests (docs/TROUBLESHOOTING.md).
- lint-staged runs `oxlint --fix` and `oxfmt` on commit; re-stage only your own paths.
- No Claude attribution in commits or PR text.

---

### Setup (before Task 1, done by the controller)

The worktree is fresh: no `node_modules`, no `dist/`. Build the dependencies **before** Task 1 so
codegen's tests in Task 2 first run against the old schema and fail.

```bash
pnpm install --frozen-lockfile
pnpm --filter "test-codegen^..." run build   # shared, codegen and their deps into dist/
```

### Task 1: Schema accepts boolean, with readable errors

**Files:**
- Modify: `packages/shared/document-model/schemas.ts:752-765`
- Test: `packages/shared/document-model/config-entry-schema.test.ts` (create)

**Interfaces:**
- Produces: `ConfigEntryTypeSchema` (z.enum of `"var" | "secret" | "boolean"`), `ConfigEntrySchema` (object with refinement). `ConfigEntryType` / `ConfigEntry` in `types.ts` follow via `z.infer`, unchanged source.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { ConfigEntrySchema } from "./schemas.js";

describe("ConfigEntrySchema", () => {
  it("accepts a boolean entry with a true/false default", () => {
    const entry = { name: "AUTH_ENABLED", type: "boolean", default: "false" };
    expect(ConfigEntrySchema.parse(entry)).toEqual(entry);
  });

  it("accepts a boolean entry without a default", () => {
    expect(
      ConfigEntrySchema.safeParse({ name: "AUTH_ENABLED", type: "boolean" })
        .success,
    ).toBe(true);
  });

  it("names the accepted types when the type is wrong", () => {
    const result = ConfigEntrySchema.safeParse({ name: "X", type: "toggle" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["type"]);
    expect(result.error?.issues[0]?.message).toBe(
      'type must be one of "var", "secret", "boolean"',
    );
  });

  it("rejects a boolean default other than true or false", () => {
    const result = ConfigEntrySchema.safeParse({
      name: "AUTH_ENABLED",
      type: "boolean",
      default: "yes",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["default"]);
    expect(result.error?.issues[0]?.message).toBe(
      'default must be "true" or "false" for a boolean entry',
    );
  });

  it.each([
    { name: "PORT", type: "var" },
    { name: "PORT", type: "var", default: "4001", required: true },
    { name: "API_KEY", type: "secret" },
    { name: "API_KEY", type: "secret", default: "ignored" },
  ])("still accepts existing entries: $type $default", (entry) => {
    expect(ConfigEntrySchema.safeParse(entry).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (in `packages/shared`): `pnpm exec vitest run document-model/config-entry-schema.test.ts`
Expected: FAIL. The boolean cases fail (`type` not accepted), the wrong-type message is `Invalid input`, the existing-entry cases pass.

- [ ] **Step 3: Implement**

Replace `ConfigEntryTypeSchema` and `ConfigEntrySchema` in `packages/shared/document-model/schemas.ts`:

```ts
export const ConfigEntryTypeSchema = z.enum(["var", "secret", "boolean"], {
  error: 'type must be one of "var", "secret", "boolean"',
});

export const ConfigEntrySchema = z
  .object({
    name: z.string(),
    type: ConfigEntryTypeSchema,
    description: z.string().optional(),
    required: z.boolean().optional(),
    // The value the host falls back to, spelled as the env var would be:
    // "true" or "false" for a `boolean`. A `secret` has no default worth
    // publishing; hosts ignore it.
    default: z.string().optional(),
  })
  .superRefine((entry, ctx) => {
    if (
      entry.type === "boolean" &&
      entry.default !== undefined &&
      entry.default !== "true" &&
      entry.default !== "false"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["default"],
        message: 'default must be "true" or "false" for a boolean entry',
      });
    }
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run (in `packages/shared`): `pnpm exec vitest run document-model/config-entry-schema.test.ts` → PASS (8 tests).
Then (in `packages/shared`): `pnpm exec tsc --noEmit` → no errors in `document-model/`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/document-model/schemas.ts packages/shared/document-model/config-entry-schema.test.ts
git commit -m "feat(shared): accept boolean manifest config entries (#3012)"
```

### Task 2: Codegen manifest test covers boolean entries

**Files:**
- Test: `test/codegen/tests/generate-manifest.test.ts` (append two cases inside `describe("generateManifest")`)

**Interfaces:**
- Consumes: `createOrUpdateManifest(data, dir)` from `@powerhousedao/codegen/file-builders`, which parses with `ManifestSchema` from shared's `dist/`.

- [ ] **Step 1: Write the failing tests**

`writeManifest` parses the result with `ManifestSchema`, so invalid input throws a `ZodError`. Its
`message` is JSON (quotes escaped), so assert on `issues`, not on `toThrow(string)`.

```ts
  it("should keep boolean config entries", async () => {
    const testOutDirPath = join(testOutputParentDir, "boolean-config");
    await mkdirRecursive(testOutDirPath);
    const entry = {
      name: "AUTH_ENABLED",
      type: "boolean" as const,
      default: "false",
    };
    await createOrUpdateManifest({ config: [entry] }, testOutDirPath);
    await createOrUpdateManifest(
      { description: "update keeps config" },
      testOutDirPath,
    );

    const manifest = JSON.parse(
      await readFile(join(testOutDirPath, "powerhouse.manifest.json"), "utf-8"),
    ) as Manifest;
    expect(manifest.config).toEqual([entry]);
  });

  it("should name the accepted config types when one is wrong", async () => {
    const testOutDirPath = join(testOutputParentDir, "invalid-config-type");
    await mkdirRecursive(testOutDirPath);
    const error = (await createOrUpdateManifest(
      { config: [{ name: "X", type: "toggle" }] } as unknown as Manifest,
      testOutDirPath,
    ).catch((e: unknown) => e)) as {
      issues?: { path: unknown[]; message: string }[];
    };
    expect(error.issues?.[0]?.path).toEqual(["config", 0, "type"]);
    expect(error.issues?.[0]?.message).toBe(
      'type must be one of "var", "secret", "boolean"',
    );
  });
```

- [ ] **Step 2: Run against the dist built in Setup (old schema) to verify they fail**

Run (in `test/codegen`): `bun test --timeout 1000000 --preload ./setup.ts ./tests/generate-manifest.test.ts`
Expected: the two new cases FAIL (boolean refused; message is `Invalid input`). Existing cases pass.

- [ ] **Step 3: Rebuild shared and codegen with Task 1**

```bash
pnpm --filter @powerhousedao/shared --filter @powerhousedao/codegen run build
```

- [ ] **Step 4: Rerun**

Run (in `test/codegen`): `bun test --timeout 1000000 --preload ./setup.ts ./tests/generate-manifest.test.ts` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add test/codegen/tests/generate-manifest.test.ts
git commit -m "test(codegen): boolean config entries and the wrong-type message (#3012)"
```

### Task 3: Academy page for the config block

**Files:**
- Create: `apps/academy/docs/academy/04-Reference/07-CLITooling/01-PackageManifest.md`

- [ ] **Step 1: Write the page**

````markdown
# Package manifest: config

`powerhouse.manifest.json` describes a package. Its `config` array lists the environment variables
the package needs, so a host (such as the Vetra hosting UI) can ask the operator for them.

```json
{
  "config": [
    { "name": "PH_API_URL", "type": "var", "required": true, "default": "https://api.example.com" },
    { "name": "PH_API_KEY", "type": "secret", "required": true },
    { "name": "AUTH_ENABLED", "type": "boolean", "default": "false", "description": "Require a signed-in caller." }
  ]
}
```

## Entry fields

| Field | Type | Meaning |
|---|---|---|
| `name` | string | The environment variable. Entries are unique by name; `ph generate` merges by name. |
| `type` | `"var"` \| `"secret"` \| `"boolean"` | How the host asks for the value (below). |
| `description` | string, optional | Shown to the operator. |
| `required` | boolean, optional | The package does not work without a value. |
| `default` | string, optional | The value the host falls back to, spelled as the env var would be. |

## Types

| Type | Host renders | Value written | `default` |
|---|---|---|---|
| `var` | free-text field | the text | any string |
| `secret` | masked field, never displayed back | the text | ignored |
| `boolean` | toggle | `"true"` or `"false"` | `"true"` or `"false"` only |

A package reads a boolean the way the Switchboard does: `process.env.AUTH_ENABLED === "true"`.

## Validation

`ph generate` parses the manifest and stops on an invalid entry, naming the path and the problem,
for example `config.0.type: type must be one of "var", "secret", "boolean"` or
`config.2.default: default must be "true" or "false" for a boolean entry`.
````

- [ ] **Step 2: Check the docs build**

Run (in `apps/academy`): `pnpm build` → completes; no broken-link or MDX error mentioning `PackageManifest`.

- [ ] **Step 3: Commit**

```bash
git add apps/academy/docs/academy/04-Reference/07-CLITooling/01-PackageManifest.md
git commit -m "docs(academy): document the manifest config block (#3012)"
```
