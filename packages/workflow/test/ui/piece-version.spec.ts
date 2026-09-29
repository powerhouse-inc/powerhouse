// Which piece version each block runs. The stack serves piece-http at one
// version; pinning another makes the runtime run the closest it has.
import type { Page } from "@playwright/test";
import {
  canvasNode,
  coreTrigger,
  createWorkflowInBrowser,
  openWorkflowEditor,
  pieceAction,
  shot,
  waitServed,
  workflowState,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

// Every test adds the documents it needs.
test.use({ seed: false });

async function createVersionedWorkflow(page: Page, drive: string) {
  const http = await pieceAction("@activepieces/piece-http", "send_request");
  const served = http.pieceVersion;
  const major = Number(served.split(".")[0]);
  // A major no source has: the runtime falls back to the newest it has.
  const fallback = { ...http, pieceVersion: `${major + 90}.0.0` };
  // The lowest prerelease of what is served: compatible, with an update.
  const below = `${served.split("-")[0]}-0`;
  const older = { ...http, pieceVersion: below };
  const id = await createWorkflowInBrowser(page, drive, {
    name: "Versions",
    enabled: false,
    trigger: { ...(await coreTrigger("manual")), config: {} },
    steps: [
      {
        key: "pinned",
        name: "Pinned ahead",
        ...fallback,
        config: { method: "GET", url: "http://127.0.0.1:1/x" },
      },
      {
        key: "old",
        name: "Pinned behind",
        ...older,
        config: { method: "GET", url: "http://127.0.0.1:1/x" },
      },
    ],
  });
  await waitServed(id, "pinned");
  return { id, fallback, older, below, major };
}

test.describe("Piece version", () => {
  test("a fallback step carries an amber badge, and the header counts and opens it", async ({
    stack,
    app,
  }) => {
    const { fallback, major } = await createVersionedWorkflow(app, stack.drive);
    await openWorkflowEditor(app, "Versions");
    const badge = canvasNode(app, "Pinned ahead").getByTestId("version-badge");
    await expect(badge).toHaveText(/^v\d+\.\d+\.\d+/);
    await expect(badge).toHaveClass(/text-wf-warn/);
    const title = await badge.getAttribute("title");
    expect(title).toContain(`Pinned ${major + 90}.0.0 is not available; runs`);
    // The untested step's test badge is outranked, and moves to the tooltip.
    expect(title).toContain("Not tested yet");
    await expect(
      canvasNode(app, "Pinned ahead").getByText("Test me", { exact: true }),
    ).toHaveCount(0);
    expect(fallback.pieceVersion).toBe(`${major + 90}.0.0`);
    await shot(app, "version-badge");

    const summary = app.getByRole("button", {
      name: "2 steps run a different piece version",
    });
    await expect(summary).toBeVisible();
    // One step falls back to another major, so the summary warns.
    await expect(summary).toHaveAttribute("data-tone", "warn");
    await expect(summary).toHaveClass(/text-wf-warn/);
    await summary.click();
    await expect(app.getByRole("textbox", { name: "Step name" })).toHaveValue(
      "Pinned ahead",
    );
    await shot(app, "version-summary");
  });

  test("Update available rewrites only the step's piece version", async ({
    stack,
    app,
  }) => {
    const { id, older } = await createVersionedWorkflow(app, stack.drive);
    await openWorkflowEditor(app, "Versions");
    await canvasNode(app, "Pinned behind").click();
    await expect(app.getByLabel("Update available")).toBeVisible();
    await app.getByRole("tab", { name: "Settings" }).click();
    const update = app.getByRole("button", { name: /^Update to v/ });
    await expect(update).toBeVisible();
    const version = (await update.textContent())!.replace("Update to v", "");
    await shot(app, "version-update-available");
    await update.click();
    await expect(
      app.getByText(`Updated to v${version}. The step's fields are re-checked`),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const state = await workflowState<{
          steps: {
            key: string;
            pieceName: string;
            pieceVersion: string;
            actionName: string;
          }[];
        }>(app, id);
        const step = state.steps.find((entry) => entry.key === "old");
        return (
          step && {
            pieceName: step.pieceName,
            pieceVersion: step.pieceVersion,
            actionName: step.actionName,
          }
        );
      })
      .toEqual({ ...older, pieceVersion: version });
    // Now on the newest version, the step offers nothing more.
    await expect(update).toBeHidden();
    await expect(
      app.getByRole("button", {
        name: "1 step runs a different piece version",
      }),
    ).toBeVisible();
  });
});
