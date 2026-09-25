// Screenshots of the workflow editors running in Connect against a live
// switchboard. Usage: README.md, "UI screenshots".
import { chromium, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  buildCss,
  canvasNode,
  CONNECT,
  ensureServers,
  openDrive,
  openSeededPage,
  openWorkflowEditor,
  PKG,
  selectInSidebar,
  SWITCHBOARD,
} from "./ui-stack.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: join(PKG, ".ui-shots") },
    theme: { type: "string", default: "light" },
    width: { type: "string", default: "1440" },
    height: { type: "string", default: "900" },
    list: { type: "boolean", default: false },
    serve: { type: "boolean", default: false },
  },
});

// ─── scenes ─────────────────────────────────────────────────────────────────

const SCENES: Record<string, (page: Page) => Promise<void>> = {
  "studio-runs": async (page) => {
    await openDrive(page);
  },
  "studio-workflow": async (page) => {
    await openDrive(page);
    await selectInSidebar(page, "Daily digest");
  },
  "studio-run-detail": async (page) => {
    await openDrive(page);
    await page.getByText("Failed", { exact: true }).last().click();
  },
  "studio-workflow-failed": async (page) => {
    await openDrive(page);
    await selectInSidebar(page, "Uptime ping");
    await page.getByText("Failed", { exact: true }).last().click();
    await page
      .getByRole("list", { name: "Steps of this run" })
      .getByRole("button")
      .first()
      .click();
  },
  "workflow-editor": async (page) => {
    await openWorkflowEditor(page);
  },
  "workflow-editor-step": async (page) => {
    await openWorkflowEditor(page);
    await canvasNode(page, "Summarise").click();
  },
  "workflow-editor-trigger": async (page) => {
    await openWorkflowEditor(page);
    await canvasNode(page, "Schedule").click();
  },
  "workflow-editor-schedule": async (page) => {
    await openWorkflowEditor(page);
    await canvasNode(page, "Schedule").click();
    await page.getByRole("radio", { name: "Weekly" }).click();
  },
  "workflow-editor-new-connection": async (page) => {
    await openWorkflowEditor(page);
    await canvasNode(page, "Summarise").click();
    await page.getByRole("button", { name: /Choose a connection/ }).click();
    await page.getByText("Create connection").click();
    await page.getByRole("button", { name: "Use this connection" }).waitFor();
  },
  "workflow-editor-select": async (page) => {
    await openWorkflowEditor(page);
    await canvasNode(page, "Summarise").click();
    await page.getByRole("combobox").filter({ hasText: "gpt" }).click();
    await page.getByRole("listbox").waitFor();
  },
  "workflow-editor-last-run": async (page) => {
    await openWorkflowEditor(page, "Uptime ping");
    await canvasNode(page, "Ping host").click();
    await page.getByRole("tab", { name: /Last run/ }).click();
  },
  "workflow-editor-settings": async (page) => {
    await openWorkflowEditor(page);
    await canvasNode(page, "Summarise").click();
    await page.getByRole("tab", { name: "Settings" }).click();
  },
  "connection-editor": async (page) => {
    await openDrive(page);
    await selectInSidebar(page, "Ops Slack");
  },
  "connection-editor-test": async (page) => {
    await openDrive(page);
    await selectInSidebar(page, "Ops Slack");
    await page.getByRole("button", { name: "Test connection" }).click();
    await page.getByRole("status").waitFor();
  },
  "connection-editor-replace": async (page) => {
    await openDrive(page);
    await selectInSidebar(page, "Ops Slack");
    await page.getByRole("button", { name: "Replace" }).click();
    await page.keyboard.type("xoxb-rotated-token");
    await page.getByRole("button", { name: "Reference" }).first().click();
  },
};

// ─── main ───────────────────────────────────────────────────────────────────

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
}

async function main() {
  if (values.list) {
    console.log(Object.keys(SCENES).join("\n"));
    return;
  }
  if (values.serve) {
    const started = await ensureServers();
    console.log(
      `Connect ${CONNECT} · switchboard ${SWITCHBOARD} — Ctrl-C to stop`,
    );
    const stop = () => {
      for (const child of started) child.kill();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    await new Promise(() => {});
  }
  const wanted = positionals.length ? positionals : Object.keys(SCENES);
  for (const name of wanted) {
    if (!(name in SCENES))
      throw new Error(`Unknown scene "${name}" (see --list)`);
  }

  await buildCss();
  const started = await ensureServers();
  const browser = await chromium.launch();
  try {
    const { page } = await openSeededPage(browser, {
      colorScheme: values.theme === "dark" ? "dark" : "light",
      viewport: { width: Number(values.width), height: Number(values.height) },
    });
    page.on("pageerror", (e) => console.warn(`  [pageerror] ${e.message}`));

    mkdirSync(values.out, { recursive: true });
    const suffix = values.theme === "dark" ? "-dark" : "";
    for (const name of wanted) {
      await page.goto(CONNECT);
      await SCENES[name](page);
      await settle(page);
      const file = join(values.out, `${name}${suffix}.png`);
      await page.screenshot({ path: file });
      console.log(`✓ ${file}`);
    }
  } finally {
    await browser.close();
    for (const child of started) child.kill();
  }
}

await main();
