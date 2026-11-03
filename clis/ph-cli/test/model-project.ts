import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect } from "vitest";
import { runModelCheck } from "../src/services/model/check.js";
import { runModelInspect } from "../src/services/model/inspect.js";

const FIXTURE = join(import.meta.dirname, "fixtures", "model-project");
const DOCUMENT_MODEL = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "packages",
  "document-model",
);

export const LEDGER = "./document-models/ledger/index.ts";
export const WALLET = "./document-models/wallet/wallet.json";

export const codeFirstConfig = (...specifiers: string[]) =>
  JSON.stringify({
    definitionSources: {
      formatVersion: 1,
      mode: "code-first",
      entries: specifiers.map((specifier) => ({ specifier })),
    },
  });

/** The fixture parts each project shape starts from. */
export const SHAPES = {
  empty: { parts: [], config: "{}" },
  "schema-first": {
    parts: ["scalars", "document-models/wallet"],
    config: "{}",
  },
  "code-first": {
    parts: ["scalars", "document-models/ledger"],
    config: codeFirstConfig(LEDGER),
  },
  mixed: {
    parts: ["scalars", "document-models/ledger", "document-models/wallet"],
    config: codeFirstConfig(LEDGER),
  },
} as const satisfies Record<
  string,
  { readonly parts: readonly string[]; readonly config: string }
>;

/** The fixture's code-first model, for tests that write a broken copy. */
export type Shape = keyof typeof SHAPES;

export const LEDGER_SOURCE = readFileSync(
  join(FIXTURE, "document-models", "ledger", "index.ts"),
  "utf8",
);

export type Project = { readonly root: string; readonly dispose: () => void };

/**
 * A package in a temp directory: the chosen fixture parts, a config, then
 * `files` on top. It links document-model and zod as an installed package does.
 */
export function createModelProject(
  shape: Shape,
  files: Readonly<Record<string, string>> = {},
): Project {
  // macOS reaches every temp directory through a symlink.
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "ph-model-")));
  cpSync(join(FIXTURE, "package.json"), join(root, "package.json"));
  for (const part of SHAPES[shape].parts) {
    cpSync(join(FIXTURE, part), join(root, part), { recursive: true });
  }
  const written = {
    "powerhouse.config.json": SHAPES[shape].config,
    ...files,
  };
  for (const [path, text] of Object.entries(written)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  mkdirSync(join(root, "node_modules"));
  symlinkSync(DOCUMENT_MODEL, join(root, "node_modules", "document-model"));
  const zod = dirname(
    createRequire(join(DOCUMENT_MODEL, "package.json")).resolve(
      "zod/package.json",
    ),
  );
  symlinkSync(realpathSync.native(zod), join(root, "node_modules", "zod"));
  return {
    root,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Reports are package relative: no root, temp directory or file URL. */
export function expectNoAbsolutePath(text: string, root: string): void {
  for (const path of [root, tmpdir(), pathToFileURL(root).href]) {
    expect(text).not.toContain(path);
    expect(text).not.toContain(JSON.stringify(path).slice(1, -1));
  }
}

export type Captured = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

async function captured(
  run: (streams: {
    out: (text: string) => void;
    err: (text: string) => void;
  }) => Promise<number>,
): Promise<Captured> {
  let stdout = "";
  let stderr = "";
  const code = await run({
    out: (text) => void (stdout += text),
    err: (text) => void (stderr += text),
  });
  return { code, stdout, stderr };
}

export const check = (root: string, json: boolean) =>
  captured((streams) =>
    runModelCheck({ json }, { projectRoot: root, streams }),
  );

export const inspect = (root: string, json: boolean, selector?: string) =>
  captured((streams) =>
    runModelInspect(
      { json, ...(selector !== undefined && { selector }) },
      { projectRoot: root, streams },
    ),
  );

/** A stored schema-first model, as the document model editor saves it. */
export function storedModel(
  id: string,
  name: string,
  overrides: {
    readonly globalSchema?: string;
    readonly modules?: readonly unknown[];
  } = {},
): string {
  return JSON.stringify({
    id,
    name,
    description: "",
    extension: `.${name.toLowerCase()}`,
    author: { name: "Fixture", website: null },
    specifications: [
      {
        version: 1,
        changeLog: [],
        state: {
          global: {
            schema:
              overrides.globalSchema ??
              `type ${name}State {\n  title: String!\n}`,
            initialValue: '{"title":""}',
            examples: [],
          },
          local: { schema: "", initialValue: "{}", examples: [] },
        },
        modules: overrides.modules ?? [
          storedModule("main", [
            storedOperation(
              "SET_TITLE",
              "input SetTitleInput {\n  title: String!\n}",
            ),
          ]),
        ],
      },
    ],
  });
}

export const storedModule = (name: string, operations: readonly unknown[]) => ({
  id: name,
  name,
  description: null,
  operations,
});

export const storedOperation = (name: string, schema: string | null) => ({
  id: name.toLowerCase(),
  name,
  description: null,
  scope: "global",
  schema,
  reducer: null,
  template: null,
  errors: [],
  examples: [],
});
