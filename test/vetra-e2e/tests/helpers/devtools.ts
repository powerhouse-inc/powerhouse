import type { Page } from "@playwright/test";
import { expect } from "./fixtures.js";
import { LONG_VISIBLE_TIMEOUT } from "./timeouts.js";
import { waitForAppReady } from "./wait.js";

export const DEVTOOLS_PAGE_PATH = "/__ph/devtools";
export const DEVTOOLS_INFO_PATH = "/__ph/devtools/api/info";
export const DEVTOOLS_TOKEN_HEADER = "x-ph-devtools-token";
/** The tag the dev server delivers the token in: what turns DevTools on. */
export const DEVTOOLS_TOKEN_TAG =
  /<meta name="ph-devtools-token" content="[\w-]+"/;
export const GENERIC_PLUGIN = "@powerhousedao/connect/plugins/generic";

export function devtools(page: Page) {
  return {
    /** The launcher's mark, which opens DevTools. */
    launcher: page.getByTestId("ph-launcher"),
    /** The whole launcher, which rests on a corner or an edge. */
    launcherBar: page.getByTestId("ph-launcher-bar"),
    frame: page.getByTestId("ph-devtools"),
    panel: page.getByTestId("ph-panel"),
    overview: page.getByTestId("ph-overview"),
    close: page.getByTestId("ph-devtools-close"),
    palette: page.getByTestId("ph-devtools-palette"),
    info: (field: string) => page.getByTestId(`ph-info-${field}`),
  };
}

/** Where DevTools saves what a tab shows (sessionStorage), and the last one
 * any tab showed (localStorage). */
export const DEVTOOLS_VIEW_KEY = "ph-devtools:view";

/** Starts the page with everything DevTools saved removed, once per tab: a
 * reload keeps what the test saved. */
export async function resetDevtoolsStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const marker = "ph-devtools-e2e:reset";
    if (sessionStorage.getItem(marker)) return;
    sessionStorage.setItem(marker, "1");
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (key.startsWith("ph-devtools:")) storage.removeItem(key);
      }
    }
  });
}

type SavedView = {
  open: boolean;
  target?: {
    panel: string;
    tab?: string;
    focus?: { kind: string; id: string };
  };
};

/** What DevTools saved for this tab: undefined before it saved anything. */
export async function savedView(page: Page): Promise<SavedView | undefined> {
  const raw = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    DEVTOOLS_VIEW_KEY,
  );
  return raw === null ? undefined : (JSON.parse(raw) as SavedView);
}

let seeds = 0;

/** Has the next load of the tab find `view` saved, as a reload would. Only
 * that load: a later reload finds what DevTools saved since. */
async function seedView(page: Page, view: SavedView): Promise<void> {
  await page.addInitScript(
    ({ key, marker, raw }) => {
      if (sessionStorage.getItem(marker)) return;
      sessionStorage.setItem(marker, "1");
      sessionStorage.setItem(key, raw);
    },
    {
      key: DEVTOOLS_VIEW_KEY,
      marker: `ph-devtools-e2e:seed:${++seeds}`,
      raw: JSON.stringify(view),
    },
  );
}

/** Loads `path` and waits until DevTools has mounted: the launcher, or the
 * dock when it opens on load. A Connect whose reactor runs in a SharedWorker
 * never reaches network idle (the worker's script request stays open): pass
 * `networkIdle: false` for it. */
export async function gotoWithDevtools(
  page: Page,
  path: string,
  { networkIdle = true }: { networkIdle?: boolean } = {},
) {
  await page.goto(path);
  if (networkIdle) await waitForAppReady(page);
  const { launcher, frame } = devtools(page);
  await expect(launcher.or(frame)).toBeVisible({
    timeout: LONG_VISIBLE_TIMEOUT,
  });
}

/** Opens DevTools from the launcher and waits for Overview's data. */
export async function openFromLauncher(page: Page) {
  const { launcher, frame, overview } = devtools(page);
  await launcher.click();
  await expect(frame).toBeVisible();
  await expect(overview).toHaveAttribute("data-state", "ready");
}

/** Waits two animation frames, so a key press has been handled and React has
 * rendered whatever it changed. */
export async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** Perceived lightness in [0, 1] of a computed CSS colour. */
export function lightness(color: string): number {
  const oklab = /^okl(?:ch|ab)\(\s*([\d.]+)(%?)/.exec(color);
  if (oklab) return Number(oklab[1]) / (oklab[2] ? 100 : 1);
  const lab = /^l(?:ch|ab)\(\s*([\d.]+)/.exec(color);
  if (lab) return Number(lab[1]) / 100;
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(color);
  if (rgb) {
    const [r, g, b] = rgb.slice(1).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  throw new Error(`Cannot read the lightness of "${color}"`);
}

export async function backgroundLightness(
  page: Page,
  testId: string,
): Promise<number> {
  const color = await page
    .getByTestId(testId)
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  return lightness(color);
}

type ServedConfig = {
  connect: {
    composition?: { module: string }[];
  };
};

export async function fetchServedConfig(page: Page): Promise<ServedConfig> {
  const response = await page.request.get("/powerhouse.config.json");
  expect(response.ok()).toBe(true);
  return (await response.json()) as ServedConfig;
}

/** Serves the page a config whose composition lacks `module`. */
export async function dropFromComposition(page: Page, module: string) {
  await page.route("**/powerhouse.config.json", async (route) => {
    const response = await route.fetch();
    const json = (await response.json()) as ServedConfig;
    json.connect.composition = (json.connect.composition ?? []).filter(
      (entry) => entry.module !== module,
    );
    await route.fulfill({ response, json });
  });
}

// --- Build pages ----------------------------------------------------------

/** Opens a DevTools page in the standalone, full-width view. Build pages poll
 * the project, so the network never idles: this waits on the page itself. */
export async function gotoBuildPage(
  page: Page,
  panel: string,
  { focus, tab }: { focus?: string; tab?: string } = {},
): Promise<void> {
  const separator = focus?.indexOf(":") ?? -1;
  await seedView(page, {
    open: false,
    target: {
      panel,
      ...(tab && { tab }),
      ...(focus && {
        focus: {
          kind: focus.slice(0, separator),
          id: focus.slice(separator + 1),
        },
      }),
    },
  });
  await gotoWithDevtools(page, DEVTOOLS_PAGE_PATH, { networkIdle: false });
}

/** The focus of a document model, optionally at one of its versions and on
 * one part of its page (`state:global`, `op:<NAME>`, `files`…). */
export function modelFocus(
  documentType: string,
  { version, item }: { version?: number; item?: string } = {},
): string {
  const at = version === undefined ? "" : `@v${version}`;
  const hash = item === undefined ? "" : `#${item}`;
  return `model:${documentType}${at}${hash}`;
}

/** The focus of an editor, drive app, subgraph or processor. */
export function moduleFocus(id: string): string {
  return `module:${id}`;
}

type ModuleKind =
  | "document-model"
  | "editor"
  | "app"
  | "subgraph"
  | "processor";

export function build(page: Page) {
  const by = (testId: string, attribute: string, value: string) =>
    page.locator(`[data-testid="${testId}"][${attribute}="${value}"]`);
  return {
    /** What a kind's page shows while the project has no module of it. */
    emptyKind: (kind: ModuleKind) => by("ph-kind-empty", "data-kind", kind),
    model: (documentType: string) =>
      by("ph-model", "data-document-type", documentType),
    /** A module's section on a model's page. */
    modelModule: (name: string) => by("ph-model-module", "data-module", name),
    /** An operation's entry in the list of a model's operations. */
    operationLink: (name: string) =>
      by("ph-operation-link", "data-operation", name),
    /** The chosen operation in full: its input, errors and examples. */
    operation: (name: string) => by("ph-operation", "data-operation", name),
    moduleRow: (id: string) => by("ph-module-row", "data-module-id", id),
    moduleDetail: (id: string) => by("ph-module-detail", "data-module-id", id),
    /** A tab of the module on screen: "overview", "files" or "checks". */
    moduleTab: (id: string) => by("ph-module-tab", "data-tab", id),
    /** A check's row, in the module's Checks tab. */
    check: (id: string) => by("ph-check", "data-check", id),
    /** A check that did not pass, as the module's Overview tab shows it. */
    problem: (id: string) => by("ph-module-problem", "data-check", id),
    /** A page's entry in the nav. The nav renders a compact copy too. */
    navItem: (panel: string) =>
      page.locator(
        `nav[aria-label="DevTools pages"] button[data-panel="${panel}"]:visible`,
      ),
  };
}

/** The count beside a page in the nav: how many of its modules have a check
 * that does not pass. 0 when the nav shows none. */
export async function navBadge(page: Page, panel: string): Promise<number> {
  const text = await build(page).navItem(panel).innerText();
  return Number(/(\d+)\s*$/.exec(text)?.[1] ?? 0);
}

/** Waits for DevTools to save `focus` (`kind:id`) as this tab's. */
export async function expectFocus(page: Page, focus: string): Promise<void> {
  await expect
    .poll(async () => {
      const saved = (await savedView(page))?.target?.focus;
      return saved && `${saved.kind}:${saved.id}`;
    })
    .toBe(focus);
}
