// DevTools › Build on the vetra host. The pages are read-only: they show the
// modules the project's code contains. So the spec writes that code the way a
// developer does, with `ph-cli generate`, and removes it when it ends.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  build,
  devtools,
  expectFocus,
  gotoBuildPage,
  modelFocus,
  moduleFocus,
  navBadge,
  resetDevtoolsStorage,
} from "./helpers/devtools.js";
import { expect, test } from "./helpers/fixtures.js";

// `ph-cli generate` takes 10 to 20 seconds here, and a page shows what it
// wrote within seconds. The suite's hour-long ceilings would hide a hang.
const TEST_TIMEOUT = 5 * 60_000;
const SHOWN_TIMEOUT = 60_000;

test.describe.configure({ mode: "serial", timeout: TEST_TIMEOUT });

const PROJECT = process.cwd();
const MANIFEST = "powerhouse.manifest.json";
const MODULE_DIRS = ["document-models", "editors", "subgraphs", "processors"];

const MODEL = {
  type: "dt-build/note",
  name: "Dt Build Note",
  folder: "document-models/dt-build-note",
};
const EDITOR = { id: "dt-build-note-editor", name: "Dt Build Note Editor" };
const APP = { id: "dt-build-app", name: "Dt Build App" };
const EDITORS_BARREL = "editors/editors.ts";

/** What `ph-cli generate document-model --document` reads. */
const MODEL_SPECIFICATION = {
  id: MODEL.type,
  name: MODEL.name,
  extension: ".dtb",
  description: "A note the DevTools Build spec generates",
  author: { name: "Powerhouse", website: "https://www.powerhouse.inc" },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type DtBuildNoteState {\n  title: String!\n  lines: [String!]!\n}",
          initialValue: '{"title":"","lines":[]}',
          examples: [],
        },
        local: { schema: "", initialValue: "", examples: [] },
      },
      modules: [
        {
          id: "dt-build-notes",
          name: "notes",
          description: "",
          operations: [
            {
              id: "dt-build-set-title",
              name: "SET_TITLE",
              description: "Renames the note",
              schema: "input SetTitleInput {\n  title: String!\n}",
              template: "",
              reducer: "state.title = action.input.title;",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "dt-build-add-line",
              name: "ADD_LINE",
              description: "",
              schema: "input AddLineInput {\n  line: String!\n}",
              template: "",
              reducer: "state.lines.push(action.input.line);",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
};

const at = (file: string) => path.join(PROJECT, file);
const read = (file: string) => fs.readFileSync(at(file), "utf8");

const run = promisify(execFile);

/** Runs `ph-cli generate` in this project. */
async function generate(...args: string[]): Promise<void> {
  await run("pnpm", ["exec", "ph-cli", "generate", ...args], {
    cwd: PROJECT,
    timeout: 3 * 60_000,
  });
}

/** Remembers the project's module folders, the files beside them and the
 * manifest. `ph-cli generate` adds folders and rewrites those files; the
 * returned function puts the project back as it was. */
function rememberProjectCode(): () => void {
  const entries = () =>
    MODULE_DIRS.flatMap((dir) =>
      fs.readdirSync(at(dir), { withFileTypes: true }).map((entry) => ({
        path: `${dir}/${entry.name}`,
        folder: entry.isDirectory(),
      })),
    );
  const files = new Map([[MANIFEST, read(MANIFEST)]]);
  const folders = new Set<string>();
  for (const entry of entries()) {
    if (entry.folder) folders.add(entry.path);
    else files.set(entry.path, read(entry.path));
  }
  return () => {
    // The files first: once they are back, nothing imports a new folder.
    for (const [file, content] of files) {
      if (!fs.existsSync(at(file)) || read(file) !== content) {
        fs.writeFileSync(at(file), content);
      }
    }
    for (const entry of entries()) {
      const known = entry.folder
        ? folders.has(entry.path)
        : files.has(entry.path);
      if (!known) fs.rmSync(at(entry.path), { recursive: true, force: true });
    }
  };
}

let restoreProjectCode: (() => void) | undefined;

test.beforeAll(() => {
  restoreProjectCode = rememberProjectCode();
});

test.afterAll(() => {
  restoreProjectCode?.();
});

test.beforeEach(async ({ page }) => {
  await resetDevtoolsStorage(page);
});

test("a kind the project has no code for says how to generate one", async ({
  page,
}) => {
  for (const [panel, kind, title, command] of [
    [
      "subgraphs",
      "subgraph",
      "No subgraphs in this project",
      "ph generate subgraph --name <name>",
    ],
    [
      "build-processors",
      "processor",
      "No processors in this project",
      "ph generate processor --name <name>",
    ],
  ] as const) {
    await gotoBuildPage(page, panel);
    const empty = build(page).emptyKind(kind);
    await expect(empty).toContainText(title, { timeout: SHOWN_TIMEOUT });
    await expect(empty.getByTestId("ph-command")).toContainText(command);
  }
});

test("a generated document model shows with its state and operations", async ({
  page,
}, testInfo) => {
  const { emptyKind, model, modelModule, operation, operationLink } =
    build(page);
  // The URL names the model before its code exists.
  await gotoBuildPage(page, "models", { focus: modelFocus(MODEL.type) });
  await expect(
    emptyKind("document-model").or(page.getByTestId("ph-model")),
  ).toBeVisible({ timeout: SHOWN_TIMEOUT });
  await expect(model(MODEL.type)).toHaveCount(0);

  const specification = testInfo.outputPath("dt-build-note.json");
  fs.writeFileSync(specification, JSON.stringify(MODEL_SPECIFICATION));
  await generate("document-model", "--document", specification);

  await expect(model(MODEL.type)).toBeVisible({ timeout: SHOWN_TIMEOUT });
  await expect(page.getByTestId("ph-model-name")).toHaveText(MODEL.name);
  await expect(page.getByTestId("ph-model-type")).toHaveText(MODEL.type);
  await expect(page.getByTestId("ph-model-extension")).toHaveText(".dtb");
  await expect(page.getByTestId("ph-checks-summary")).toHaveAttribute(
    "data-state",
    "pass",
  );
  const state = page.getByTestId("ph-model-state");
  await expect(state).toHaveAttribute("data-scope", "global");
  await expect(state.getByTestId("ph-state-schema")).toContainText(
    "type DtBuildNoteState",
  );
  await expect(state.getByTestId("ph-state-schema")).toContainText(
    "lines: [String!]!",
  );
  await expect(state.getByTestId("ph-state-initial")).toContainText(
    '"lines": []',
  );
  await state
    .locator('[data-testid="ph-state-tab"][data-scope="local"]')
    .click();
  await expect(state.getByTestId("ph-state-none")).toContainText(
    "No local state",
  );

  // One section per module, below the state.
  await expect(page.getByTestId("ph-model-module")).toHaveCount(1);
  const notes = modelModule("notes");
  await expect(notes.getByTestId("ph-operation-link")).toHaveCount(2);
  await expect(operationLink("ADD_LINE")).toBeVisible();

  await operationLink("SET_TITLE").click();
  await expectFocus(page, modelFocus(MODEL.type, { item: "op:SET_TITLE" }));
  const setTitle = operation("SET_TITLE");
  await expect(setTitle.getByTestId("ph-operation-scope")).toHaveText("global");
  await expect(setTitle.getByTestId("ph-operation-input")).toContainText(
    "input SetTitleInput",
  );
});

test("a generated editor passes its checks, and a lost registration warns", async ({
  page,
}) => {
  const { emptyKind, moduleRow, moduleDetail, moduleTab, check, problem } =
    build(page);
  await gotoBuildPage(page, "editors", { focus: moduleFocus(EDITOR.id) });
  await expect(
    emptyKind("editor").or(page.getByTestId("ph-module-detail")),
  ).toBeVisible({ timeout: SHOWN_TIMEOUT });
  const problems = await navBadge(page, "editors");
  const unregistered = read(EDITORS_BARREL);

  await generate(
    "editor",
    "--name",
    EDITOR.name,
    "--document-type",
    MODEL.type,
  );

  const row = moduleRow(EDITOR.id);
  const detail = moduleDetail(EDITOR.id);
  await expect(row).toHaveAttribute("data-state", "pass", {
    timeout: SHOWN_TIMEOUT,
  });
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(detail.getByTestId("ph-checks-pass")).toBeVisible();
  const documentType = detail.getByTestId("ph-document-type-link");
  await expect(documentType).toContainText(MODEL.type);
  await expect(documentType).toContainText(MODEL.name);

  await moduleTab("checks").click();
  await expect(check("registered")).toHaveText(
    `Registered in ${EDITORS_BARREL}`,
  );
  await expect(check("manifest")).toHaveText(`Listed in ${MANIFEST}`);
  await expect(check("document-types")).toHaveAttribute("data-tone", "ok");
  await expect(check("loaded")).toHaveText("Loaded in this tab", {
    timeout: SHOWN_TIMEOUT,
  });

  // The dev server reloads the page while `generate` writes files. It takes a
  // changed registration without a reload, so from here on what the page shows
  // comes from DevTools reading the project again.
  let reloads = 0;
  page.on("load", () => reloads++);
  const registered = read(EDITORS_BARREL);
  fs.writeFileSync(at(EDITORS_BARREL), unregistered);
  await expect(row).toHaveAttribute("data-state", "warn", {
    timeout: SHOWN_TIMEOUT,
  });
  await expect(check("registered")).toHaveAttribute("data-tone", "warn");
  await expect(check("registered")).toContainText(
    `Not registered in ${EDITORS_BARREL}`,
  );
  await expect(check("registered")).toContainText("ph generate editor --all");
  await moduleTab("overview").click();
  await expect(problem("registered")).toContainText(
    `Not registered in ${EDITORS_BARREL}`,
  );
  await expect.poll(() => navBadge(page, "editors")).toBe(problems + 1);

  fs.writeFileSync(at(EDITORS_BARREL), registered);
  await expect(row).toHaveAttribute("data-state", "pass", {
    timeout: SHOWN_TIMEOUT,
  });
  await expect(problem("registered")).toHaveCount(0);
  await moduleTab("checks").click();
  await expect(check("registered")).toHaveAttribute("data-tone", "ok");
  await expect.poll(() => navBadge(page, "editors")).toBe(problems);
  expect(reloads).toBe(0);
});

test("the editor links to the model whose documents it edits", async ({
  page,
}) => {
  const { model, moduleDetail } = build(page);
  await gotoBuildPage(page, "editors", { focus: moduleFocus(EDITOR.id) });
  await moduleDetail(EDITOR.id).getByTestId("ph-document-type-link").click();
  await expectFocus(page, modelFocus(MODEL.type));
  await expect(model(MODEL.type)).toBeVisible();
});

test("Drive Apps is empty until an app's code exists", async ({ page }) => {
  const { emptyKind, moduleRow, moduleDetail, moduleTab, check } = build(page);
  await gotoBuildPage(page, "apps");
  const empty = emptyKind("app");
  await expect(empty).toContainText("No drive apps in this project", {
    timeout: SHOWN_TIMEOUT,
  });
  await expect(empty.getByTestId("ph-command")).toContainText(
    "ph generate app --name <name>",
  );

  await generate("app", "--name", APP.name, "--document-types", MODEL.type);

  await expect(moduleRow(APP.id)).toHaveAttribute("data-state", "pass", {
    timeout: SHOWN_TIMEOUT,
  });
  await expect(empty).toHaveCount(0);
  const facts = moduleDetail(APP.id).getByTestId("ph-module-facts");
  await expect(facts).toContainText("powerhouse/document-drive");
  await expect(facts.getByTestId("ph-document-type-link")).toContainText(
    MODEL.type,
  );
  await moduleTab("checks").click();
  await expect(check("loaded")).toHaveText("Loaded in this tab", {
    timeout: SHOWN_TIMEOUT,
  });
});

test("the pages have no field but the list's filter and a legacy notice's dry-run box, and no control that creates, renames or deletes", async ({
  page,
}) => {
  const { panel } = devtools(page);
  for (const [name, focus] of [
    ["models", modelFocus(MODEL.type)],
    ["editors", moduleFocus(EDITOR.id)],
    ["apps", moduleFocus(APP.id)],
  ]) {
    await gotoBuildPage(page, name, { focus });
    await expect(
      panel.getByTestId("ph-model").or(panel.getByTestId("ph-module-detail")),
    ).toBeVisible({ timeout: SHOWN_TIMEOUT });
    // The filter narrows the list, "New" copies the command to run, and the
    // dry-run box of a legacy module's notice changes only the command shown.
    await expect(
      panel.locator(
        'input:not([data-testid="ph-module-filter"]):not([data-testid="ph-legacy-dry-run"] input), textarea, select, [contenteditable]',
      ),
    ).toHaveCount(0);
    await expect(
      panel
        .getByRole("button", {
          name: /\b(new|add|create|rename|delete|remove|confirm|save)\b/i,
        })
        .and(panel.locator(':not([data-testid="ph-module-new"])')),
    ).toHaveCount(0);
  }
});
