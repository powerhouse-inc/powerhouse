import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  VitePackageLoader,
  startViteServer,
} from "../src/packages/vite-loader.mjs";

const VALID = "DE89370400440532013000";
const LOWERCASE = "de89370400440532013000";

let root = "";
let vite: ViteDevServer;
let loader: VitePackageLoader;

async function write(file: string, contents: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, contents);
}

const writeScalars = (pattern: string) =>
  write(
    join(root, "scalars", "index.ts"),
    [
      `import { defineScalar } from "document-model/scalars";`,
      `import { z } from "zod";`,
      `export const Iban = defineScalar({ name: "Iban", schema: z.string().regex(${pattern}) });`,
    ].join("\n"),
  );

// macOS reports the fixture writes after the watcher starts; a reload they
// trigger would hide whether the scalars edit triggers one.
async function watcherQuiet(quietMs = 1000): Promise<void> {
  let last = Date.now();
  const touch = () => {
    last = Date.now();
  };
  const events = ["change", "add", "unlink"] as const;
  for (const event of events) vite.watcher.on(event, touch);
  try {
    await vi.waitFor(() => expect(Date.now() - last).toBeGreaterThan(quietMs), {
      timeout: 15_000,
      interval: 100,
    });
  } finally {
    for (const event of events) vite.watcher.off(event, touch);
  }
}

type Ledger = {
  iban: unknown;
  actions: { setIban: (input: unknown) => unknown };
};

describe("VitePackageLoader and a project's scalars", () => {
  beforeAll(async () => {
    // realpath: on Windows tmpdir() is an 8.3 short path, and watching one
    // aborts the process from libuv's uv__relative_path assertion.
    root = await realpath(
      await mkdtemp(join(tmpdir(), "vite-loader-scalars-")),
    );
    await write(
      join(root, "package.json"),
      JSON.stringify({
        name: "@acme/ledger",
        version: "1.0.0",
        type: "module",
      }),
    );
    await mkdir(join(root, "node_modules"));
    for (const dependency of ["document-model", "zod"]) {
      await symlink(
        await realpath(
          resolve(import.meta.dirname, "../node_modules", dependency),
        ),
        join(root, "node_modules", dependency),
        "junction",
      );
    }
    await writeScalars("/^[A-Za-z]{2}\\d{2}[A-Za-z0-9]{11,30}$/");
    await write(
      join(root, "document-models", "ledger", "v1", "gen", "schema", "zod.ts"),
      [
        `import { z } from "zod";`,
        `import { Iban } from "../../../../../scalars/index.js";`,
        `export { Iban };`,
        `export const SetIbanInputSchema = () => z.object({ iban: Iban.schema });`,
      ].join("\n"),
    );
    await write(
      join(root, "document-models", "index.ts"),
      [
        `import { Iban, SetIbanInputSchema } from "./ledger/v1/gen/schema/zod.js";`,
        `export const Ledger = {`,
        `  documentModel: { global: { id: "acme/ledger" } },`,
        `  iban: Iban,`,
        `  actions: { setIban: (input: unknown) => SetIbanInputSchema().parse(input) },`,
        `};`,
      ].join("\n"),
    );
    vite = await startViteServer(root);
    loader = VitePackageLoader.build(vite);
    await watcherQuiet();
  }, 60_000);

  afterAll(async () => {
    await vite.close();
    await rm(root, { recursive: true, force: true });
  });

  it("reloads the document models with the edited definition", async () => {
    const [before] = (await loader.loadDocumentModels(
      root,
    )) as unknown as Ledger[];
    expect(before.actions.setIban({ iban: LOWERCASE })).toEqual({
      iban: LOWERCASE,
    });

    const reloads: Ledger[][] = [];
    const unsubscribe = loader.onDocumentModelsChange(root, (models) => {
      reloads.push(models as unknown as Ledger[]);
    });
    try {
      await writeScalars("/^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$/");

      await expect.poll(() => reloads.length, { timeout: 15_000 }).toBe(1);
      const [[after]] = reloads;
      expect(after.actions.setIban({ iban: VALID })).toEqual({ iban: VALID });
      expect(() => after.actions.setIban({ iban: LOWERCASE })).toThrow(
        "Invalid string: must match pattern",
      );
      const scalars = await loader.loadScalars(root);
      expect(scalars).toEqual([{ exportName: "Iban", definition: after.iban }]);
    } finally {
      unsubscribe();
    }
  }, 40_000);

  it("loads scalars/index.ts once a project that had none creates it", async () => {
    const bare = await realpath(
      await mkdtemp(join(tmpdir(), "vite-loader-no-scalars-")),
    );
    await write(
      join(bare, "package.json"),
      JSON.stringify({ name: "@acme/bare", version: "1.0.0", type: "module" }),
    );
    await mkdir(join(bare, "node_modules"));
    for (const dependency of ["document-model", "zod"]) {
      await symlink(
        await realpath(
          resolve(import.meta.dirname, "../node_modules", dependency),
        ),
        join(bare, "node_modules", dependency),
        "junction",
      );
    }
    const server = await startViteServer(bare);
    try {
      const bareLoader = VitePackageLoader.build(server);
      expect(await bareLoader.loadScalars(bare)).toEqual([]);

      let seen: unknown;
      const unsubscribe = bareLoader.onScalarsChange(bare, (scalars) => {
        seen = scalars.map((scalar) =>
          "definition" in scalar
            ? {
                exportName: scalar.exportName,
                name: scalar.definition.name,
                valid: scalar.definition.schema.safeParse(VALID).success,
                lowercase:
                  scalar.definition.schema.safeParse(LOWERCASE).success,
              }
            : scalar,
        );
      });
      try {
        await write(
          join(bare, "scalars", "index.ts"),
          [
            `import { defineScalar } from "document-model/scalars";`,
            `import { z } from "zod";`,
            `export const Iban = defineScalar({ name: "Iban", schema: z.string().regex(/^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$/) });`,
          ].join("\n"),
        );

        await expect
          .poll(() => seen, { timeout: 15_000 })
          .toEqual([
            { exportName: "Iban", name: "Iban", valid: true, lowercase: false },
          ]);
      } finally {
        unsubscribe();
      }
    } finally {
      await server.close();
      await rm(bare, { recursive: true, force: true });
    }
  }, 60_000);
});
